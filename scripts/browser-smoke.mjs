import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const host = "127.0.0.1";
const port = Number(process.env.BROWSER_SMOKE_PORT ?? 30_000 + (process.pid % 20_000));
const repositoryPath = "/MapFromVtoW/";
const baseUrl = `http://${host}:${port}${repositoryPath}`;
const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const artifactDir = new URL("../output/playwright/", import.meta.url);
const viteBin = fileURLToPath(new URL("../node_modules/vite/bin/vite.js", import.meta.url));
const requestedChromePath = process.env.CHROME_PATH;
const systemChromePath = "/usr/bin/google-chrome";
const executablePath =
  requestedChromePath ?? (existsSync(systemChromePath) ? systemChromePath : undefined);

await mkdir(artifactDir, { recursive: true });

const preview = spawn(
  process.execPath,
  [
    viteBin,
    "preview",
    "--base",
    repositoryPath,
    "--host",
    host,
    "--port",
    `${port}`,
    "--strictPort"
  ],
  { cwd: projectRoot, stdio: ["ignore", "inherit", "inherit"] }
);

let browser;

try {
  await waitForServer(baseUrl, preview);
  browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {})
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const browserErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await assertInitialRender(page);
  await assertThemePersistence(page);
  await assertMapAndVectorForms(page);
  await assertSingularBasisAndRecovery(page);
  await assertSourceBasisWorkflow(page);
  await assertFitView(page);
  await assertResponsiveLayout(page);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await restoreDefaults(page);
  await page.screenshot({
    path: new URL("browser-smoke.png", artifactDir).pathname,
    fullPage: true
  });

  assert.deepEqual(browserErrors, [], `Browser errors:\n${browserErrors.join("\n")}`);
  console.log("Browser smoke checks passed.");
} finally {
  await browser?.close();
  preview.kill("SIGTERM");
  await waitForExit(preview);
}

async function assertInitialRender(page) {
  assert.match(await page.title(), /(linear map|map.+v.+w)/i);
  await assertUniqueVisible(page, "#map-form");
  await assertUniqueVisible(page, "#source-basis-form");
  await assertUniqueVisible(page, "#basis-form");
  await assertUniqueVisible(page, "#vector-form");
  await assertUniqueVisible(page, "#v-plot");
  await assertUniqueVisible(page, "#w-plot");
  await assertUniqueVisible(page, "#representation-matrix");
  await assertUniqueVisible(page, "#matrix-component-e1");
  await assertUniqueVisible(page, "#matrix-component-e2");

  const expectedInputs = {
    "#map-11": "1",
    "#map-12": "2",
    "#map-21": "0",
    "#map-22": "1",
    "#source-basis-first-x": "1",
    "#source-basis-first-y": "0",
    "#source-basis-second-x": "0",
    "#source-basis-second-y": "1",
    "#basis-first-x": "1",
    "#basis-first-y": "1",
    "#basis-second-x": "-1",
    "#basis-second-y": "1",
    "#vector-x": "2",
    "#vector-y": "1"
  };
  for (const [selector, value] of Object.entries(expectedInputs)) {
    assert.equal(await page.locator(selector).inputValue(), value, `${selector} has the wrong default.`);
  }

  for (const selector of [
    "#apply-map-button",
    "#update-source-basis-button",
    "#update-basis-button",
    "#set-vector-button",
    "#clear-vector-button",
    "#theme-toggle"
  ]) {
    await assertUniqueVisible(page, selector);
  }

  for (const removedSelector of [
    ".results-card",
    "#focus-image-e1",
    "#focus-image-e2",
    "#focus-image-v",
    "#decomposition-image-e1",
    "#decomposition-image-e2",
    "#decomposition-image-v",
    "#matrix-column-e1",
    "#matrix-column-e2",
    "#vector-identity",
    ".eyebrow",
    ".plot-help",
    ".space-badge",
    "#fit-view-button"
  ]) {
    assert.equal(await page.locator(removedSelector).count(), 0, `${removedSelector} was removed.`);
  }
  assert.equal(
    await page.locator(".matrix-banner").getByText("Matrix representation", { exact: true }).count(),
    0,
    "The matrix banner must not retain the visible explanatory heading."
  );

  assert.match(normalizeText(await page.locator("#source-basis-status").textContent()), /valid basis/i);
  assert.match(normalizeText(await page.locator("#basis-status").textContent()), /valid basis/i);
  await assertDefaultRepresentation(page);
  await assertMatrixPresentation(page);
  await assertMatrixComponentEquations(page, ["1/2,-1/2", "3/2,-1/2"]);
  await assertBasisHeadingBraces(page);
  await assertCoefficientLabelTex(page);
  await assertPlotLabelPills(page, "dark");
  await assertArrowLineStyles(page);
  await assertSelectedVectorPaintOrder(page);
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");

  const vPlot = page.locator("#v-plot");
  const wPlot = page.locator("#w-plot");
  assert.ok((await vPlot.locator("line, path, circle, polyline, polygon").count()) > 0);
  assert.ok((await wPlot.locator("line, path, circle, polyline, polygon").count()) > 0);
  await assertSharedPlotContract(page);
  assert.equal(await vPlot.getAttribute("data-bounds"), "-5,5,-5,5");
  assert.equal(
    await page.locator("#v-plot [data-tick-axis], #w-plot [data-tick-axis]").count(),
    0,
    "The plots must omit numeric axis tick labels."
  );
  assert.equal(
    await page.locator("#v-plot [data-axis-label], #w-plot [data-axis-label]").count(),
    0,
    "The plots must omit x/y axis labels."
  );
  const plotText = await page.locator("#v-plot text, #w-plot text").allTextContents();
  assert.deepEqual(
    plotText.map((value) => value.trim().toLowerCase()).filter((value) => value === "x" || value === "y"),
    [],
    "The SVG plots must not render x or y axis text."
  );
}

async function assertDefaultRepresentation(page) {
  const matrix = page.locator("#representation-matrix");
  const machineValue = await matrix.getAttribute("data-matrix");
  if (machineValue !== null) {
    assert.deepEqual(
      matrixColumns(machineValue),
      [
        ["1/2", "-1/2"],
        ["3/2", "-1/2"]
      ],
      "The default matrix columns must be the exact B_W coordinates of f(e_1) and f(e_2)."
    );
    return;
  }

  const annotation = matrix.locator(".katex-mathml annotation");
  const source = normalizeMath(
    (await annotation.count()) > 0 ? await annotation.first().textContent() : await matrix.textContent()
  );
  assert.ok(source.length > 0, "The default representation matrix must be rendered.");
  assert.match(source, /(?:\\frac\{1\}\{2\}|1\/2|0\.5)/);
  assert.match(source, /(?:-|−|\\minus|\\frac\{-1\}\{2\}|-\\frac\{1\}\{2\})/);
}

async function assertThemePersistence(page) {
  const root = page.locator("html");
  const toggle = page.locator("#theme-toggle");
  assert.equal(await root.getAttribute("data-theme"), "dark");

  await toggle.click();
  assert.equal(await root.getAttribute("data-theme"), "light");
  await assertPlotLabelPills(page, "light");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(
    await root.getAttribute("data-theme"),
    "light",
    "The selected theme must survive a reload."
  );
  await assertPlotLabelPills(page, "light");

  await toggle.click();
  assert.equal(await root.getAttribute("data-theme"), "dark");
  await assertPlotLabelPills(page, "dark");
  const placement = await toggle.evaluate((node) => {
    const rectangle = node.getBoundingClientRect();
    return {
      position: getComputedStyle(node).position,
      left: rectangle.left,
      bottomGap: window.innerHeight - rectangle.bottom
    };
  });
  assert.equal(placement.position, "fixed");
  assert.ok(placement.left >= 0 && placement.left <= 24);
  assert.ok(placement.bottomGap >= 0 && placement.bottomGap <= 24);
}

async function assertMatrixPresentation(page) {
  const matrix = page.locator("#representation-matrix");
  assert.equal(await matrix.locator(".katex").count(), 1, "The matrix must be rendered with KaTeX.");
  const source = await readMathSource(matrix);
  assert.ok(
    source.includes(String.raw`[f]_{B_W\leftarrowB_V}=A=`),
    `The matrix TeX must read [f] from B_V to B_W, then A; received ${source}.`
  );
  assert.equal(source.includes(String.raw`A=[f]_{B_W\leftarrowB_V}`), false);
  assert.equal(
    source.includes(String.raw`\frac{-`),
    false,
    "Negative fraction signs must sit before the fraction, not in its numerator."
  );
  const fontSize = await matrix
    .locator(".katex")
    .evaluate((node) => Number.parseFloat(getComputedStyle(node).fontSize));
  assert.ok(fontSize >= 20, `The central matrix must be visibly enlarged; received ${fontSize}px.`);

  const fractionBoxes = await matrix.locator(".katex-html .mfrac").evaluateAll((nodes) =>
    nodes
      .map((node) => {
        const box = node.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, center: (box.top + box.bottom) / 2 };
      })
      .sort((left, right) => left.center - right.center)
  );
  assert.equal(fractionBoxes.length, 4, "The default matrix must visibly render four fractions.");
  const upperRowBottom = Math.max(...fractionBoxes.slice(0, 2).map((box) => box.bottom));
  const lowerRowTop = Math.min(...fractionBoxes.slice(2).map((box) => box.top));
  assert.ok(
    lowerRowTop - upperRowBottom >= 4,
    `Fraction rows must not touch or clip; measured ${lowerRowTop - upperRowBottom}px of clearance.`
  );
}

async function assertMatrixComponentEquations(page, expectedCoordinates) {
  const sources = [];
  for (const [componentIndex, [selector, basisIndex]] of [
    ["#matrix-component-e1", "1"],
    ["#matrix-component-e2", "2"]
  ].entries()) {
    const component = page.locator(selector);
    const source = await readMathSource(component);
    assert.ok(source.includes("f("), `${selector} must begin with an image under f.`);
    assert.ok(hasSubscriptedSymbol(source, "e", basisIndex), `${selector} must identify e_${basisIndex}.`);
    assert.ok(source.includes("B_W"), `${selector} must identify its coordinates in B_W.`);
    assert.ok(source.includes(String.raw`\begin{bmatrix}`), `${selector} must display a column vector.`);
    assert.equal(hasSubscriptedSymbol(source, "w", "1"), false, `${selector} must not be a basis decomposition.`);
    assert.equal(hasSubscriptedSymbol(source, "w", "2"), false, `${selector} must not be a basis decomposition.`);
    assert.equal(source.includes(String.raw`\frac{-`), false, `${selector} must keep minus signs outside fractions.`);
    const lowerSource = source.toLowerCase();
    const expectedLabelColor = basisIndex === "1" ? "#1b7f5a" : "#c4454d";
    const labelColorToken = String.raw`\color{${expectedLabelColor}}{f(`;
    const blueToken = String.raw`\color{#2f6fdb}{`;
    const purpleToken = String.raw`\color{#9b6acb}{`;
    const labelColorIndex = lowerSource.indexOf(labelColorToken);
    const blueIndex = lowerSource.indexOf(blueToken);
    const purpleIndex = lowerSource.indexOf(purpleToken);
    assert.ok(
      labelColorIndex >= 0,
      `${selector}'s f(e_${basisIndex}) label must use its ${basisIndex === "1" ? "green" : "red"} source-basis color.`
    );
    assert.ok(blueIndex >= 0, `${selector}'s first B_W coordinate must use the w_1 blue.`);
    assert.ok(purpleIndex > blueIndex, `${selector}'s second B_W coordinate must use the w_2 purple.`);
    assert.ok(
      blueIndex > labelColorIndex && purpleIndex > labelColorIndex,
      `${selector} must color the label independently from its blue and purple coordinate entries.`
    );
    assert.equal(
      lowerSource.split(labelColorToken).length - 1,
      1,
      `${selector} must color exactly its f(e_${basisIndex}) label with the source-basis color.`
    );
    assert.equal(
      lowerSource.split(blueToken).length - 1,
      1,
      `${selector} must color exactly its first coordinate blue.`
    );
    assert.equal(
      lowerSource.split(purpleToken).length - 1,
      1,
      `${selector} must color exactly its second coordinate purple.`
    );
    if (expectedCoordinates !== undefined) {
      assert.equal(
        await component.getAttribute("data-coordinates"),
        expectedCoordinates[componentIndex],
        `${selector} must expose its exact B_W coordinate column.`
      );
    }
    sources.push(source);
  }
  return sources;
}

function matrixColumns(machineValue) {
  const rows = machineValue.split(";").map((row) => row.split(","));
  assert.deepEqual(rows.map((row) => row.length), [2, 2], "The representation must be a 2 by 2 matrix.");
  return [
    [rows[0][0], rows[1][0]],
    [rows[0][1], rows[1][1]]
  ];
}

function hasSubscriptedSymbol(source, symbol, index) {
  return source.includes(`${symbol}_${index}`) || source.includes(`{${symbol}}_${index}`);
}

async function assertArrowLineStyles(page) {
  for (const name of ["image-e1", "image-e2"]) {
    const line = page.locator(`#w-plot [data-arrow="${name}"] line`);
    assert.equal(await line.count(), 1, `${name} must have one visible arrow line.`);
    assert.ok(
      [null, "", "none"].includes(await line.getAttribute("stroke-dasharray")),
      `${name} must be solid.`
    );
  }
  for (const name of ["decomposition-w1", "decomposition-w2"]) {
    const line = page.locator(`#w-plot [data-arrow="${name}"] line`);
    assert.equal(await line.count(), 1, `${name} must have one visible component line.`);
    const dashArray = await line.getAttribute("stroke-dasharray");
    assert.ok(dashArray !== null && dashArray !== "" && dashArray !== "none", `${name} must be dashed.`);
  }
}

async function assertSelectedVectorPaintOrder(page) {
  for (const [plotSelector, selectedArrow] of [
    ["#v-plot", "source-v"],
    ["#w-plot", "image-v"]
  ]) {
    const arrowOrder = await page.locator(plotSelector).evaluate((svg) =>
      [...svg.querySelectorAll("[data-arrow]")].map((node) => node.getAttribute("data-arrow"))
    );
    assert.ok(arrowOrder.length > 1, `${plotSelector} must contain multiple arrows to test paint order.`);
    assert.equal(
      arrowOrder.at(-1),
      selectedArrow,
      `${selectedArrow} must be the last [data-arrow] group in ${plotSelector} so it paints above every other arrow; received ${arrowOrder.join(", ")}.`
    );
  }
}

async function assertBasisHeadingBraces(page) {
  for (const [selector, basisName] of [
    ["#v-space-heading", "B_V"],
    ["#w-space-heading", "B_W"]
  ]) {
    const source = await readMathSource(page.locator(selector));
    const hasOpeningBrace =
      source.includes(`${basisName}=\\{`) || source.includes(`${basisName}=\\left\\{`);
    assert.equal(hasOpeningBrace, true, `${basisName} must use an opening curly brace.`);
    assert.ok(
      source.includes("\\}") || source.includes("\\right\\}"),
      `${basisName} must use a closing curly brace.`
    );
    assert.equal(source.includes(`${basisName}=(`), false, `${basisName} must not use parentheses.`);
  }
}

async function assertCoefficientLabelTex(page) {
  const labels = page.locator([
    '[data-label="source-component-e1-label"]',
    '[data-label="source-component-e2-label"]',
    '[data-label="decomposition-w1-label"]',
    '[data-label="decomposition-w2-label"]'
  ].join(", "));
  assert.equal(await labels.count(), 4, "Both source and output component labels must be present.");
  const texValues = await labels.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-tex"))
  );
  for (const tex of texValues) {
    assert.ok(tex?.includes("\\vec"), `A coefficient label must contain a vector: ${tex}.`);
    assert.equal(/[()]/.test(tex ?? ""), false, `Coefficient TeX must not wrap in parentheses: ${tex}.`);
    const compact = normalizeMath(tex);
    const vectorIndex = compact.indexOf("\\vec");
    const coefficient = compact.slice(0, vectorIndex);
    assert.ok(
      coefficient.length === 0 || /(?:\d|}|-)$/.test(coefficient),
      `The coefficient must be directly adjacent to \\vec: ${tex}.`
    );
  }
}

async function assertPlotLabelPills(page, expectedTheme) {
  const snapshot = await page.evaluate(() => {
    const root = document.documentElement;
    const rootFontSize = Number.parseFloat(getComputedStyle(root).fontSize);
    const plots = ["v-plot", "w-plot"].map((plotId) => {
      const plot = document.getElementById(plotId);
      if (!(plot instanceof SVGSVGElement)) {
        return { plotId, missing: true, labels: [] };
      }

      const plotBox = plot.getBoundingClientRect();
      const labels = [...plot.querySelectorAll("[data-label]")].map((host) => {
        const chip = host.querySelector(":scope > .plot-label > .plot-label-chip");
        const math = chip?.querySelector(":scope > .katex");
        if (!(chip instanceof HTMLElement) || !(math instanceof HTMLElement)) {
          return {
            key: host.getAttribute("data-label") ?? "unnamed",
            missingChip: true
          };
        }

        const style = getComputedStyle(chip);
        const chipBox = chip.getBoundingClientRect();
        const mathBox = math.getBoundingClientRect();
        return {
          key: host.getAttribute("data-label") ?? "unnamed",
          missingChip: false,
          backgroundColor: style.backgroundColor,
          borderRadii: [
            style.borderTopLeftRadius,
            style.borderTopRightRadius,
            style.borderBottomRightRadius,
            style.borderBottomLeftRadius
          ],
          display: style.display,
          padding: {
            top: Number.parseFloat(style.paddingTop),
            right: Number.parseFloat(style.paddingRight),
            bottom: Number.parseFloat(style.paddingBottom),
            left: Number.parseFloat(style.paddingLeft)
          },
          chipBox: rect(chipBox),
          mathBox: rect(mathBox),
          insidePlot:
            chipBox.left >= plotBox.left - 1 &&
            chipBox.top >= plotBox.top - 1 &&
            chipBox.right <= plotBox.right + 1 &&
            chipBox.bottom <= plotBox.bottom + 1
        };
      });

      return { plotId, missing: false, labels };
    });

    return {
      theme: root.getAttribute("data-theme"),
      rootFontSize,
      scrollWidth: root.scrollWidth,
      viewportWidth: Math.max(root.clientWidth, window.innerWidth),
      plots
    };

    function rect(value) {
      return {
        width: value.width,
        height: value.height,
        left: value.left,
        top: value.top,
        right: value.right,
        bottom: value.bottom
      };
    }
  });

  assert.equal(snapshot.theme, expectedTheme, `Plot pills must be checked in ${expectedTheme} mode.`);
  assert.ok(Number.isFinite(snapshot.rootFontSize) && snapshot.rootFontSize > 0);
  assert.ok(
    snapshot.scrollWidth <= snapshot.viewportWidth + 1,
    `${expectedTheme} plot labels must not cause document overflow; scroll width ${snapshot.scrollWidth}px, viewport ${snapshot.viewportWidth}px.`
  );

  const expectedVerticalPadding = snapshot.rootFontSize * 0.2;
  const expectedHorizontalPadding = snapshot.rootFontSize * 0.36;
  for (const plot of snapshot.plots) {
    assert.equal(plot.missing, false, `#${plot.plotId} must exist for label-pill checks.`);
    assert.ok(plot.labels.length > 0, `#${plot.plotId} must expose plot labels.`);

    for (const label of plot.labels) {
      const identity = `#${plot.plotId} ${label.key}`;
      assert.equal(label.missingChip, false, `${identity} must contain a label pill.`);
      if (label.missingChip) {
        continue;
      }

      assert.ok(
        label.display === "flex" || label.display === "inline-flex",
        `${identity}'s pill must retain its flex chip layout; received ${label.display}.`
      );
      assert.ok(
        hasVisibleBackground(label.backgroundColor),
        `${identity}'s pill needs a non-transparent background in ${expectedTheme} mode; received ${label.backgroundColor}.`
      );
      for (const radius of label.borderRadii) {
        assert.ok(
          Math.abs(Number.parseFloat(radius) - 999) <= 0.1,
          `${identity}'s pill must use a 999px radius; received ${radius}.`
        );
      }
      for (const [side, actual, expected] of [
        ["top", label.padding.top, expectedVerticalPadding],
        ["right", label.padding.right, expectedHorizontalPadding],
        ["bottom", label.padding.bottom, expectedVerticalPadding],
        ["left", label.padding.left, expectedHorizontalPadding]
      ]) {
        assert.ok(
          Number.isFinite(actual) && Math.abs(actual - expected) <= 0.3,
          `${identity}'s ${side} padding must match the ChangeofBasis pill spacing; expected about ${expected}px, received ${actual}px.`
        );
      }

      const horizontalPadding = label.padding.left + label.padding.right;
      const verticalPadding = label.padding.top + label.padding.bottom;
      assert.ok(
        Math.abs(label.chipBox.width - label.mathBox.width - horizontalPadding) <= 1,
        `${identity}'s pill must hug its KaTeX content horizontally.`
      );
      assert.ok(
        Math.abs(label.chipBox.height - label.mathBox.height - verticalPadding) <= 1,
        `${identity}'s pill must hug its KaTeX content vertically.`
      );
      assert.equal(label.insidePlot, true, `${identity}'s pill must remain inside its plot.`);
    }
  }
}

function hasVisibleBackground(value) {
  const normalized = value.replace(/\s+/g, "").toLowerCase();
  return normalized !== "" &&
    normalized !== "transparent" &&
    normalized !== "rgba(0,0,0,0)" &&
    !/\/0(?:\.0+)?\)$/.test(normalized);
}

async function assertMapAndVectorForms(page) {
  const initialWPlot = await plotSignature(page, "#w-plot");
  await setMap(page, ["2", "1/2", "-1", "3"]);
  assert.equal(await page.locator("#map-12").inputValue(), "1/2");
  assert.notEqual(await plotSignature(page, "#w-plot"), initialWPlot);

  await setMap(page, ["1", "2", "0", "1"]);
  await assertDefaultRepresentation(page);

  await page.locator("#clear-vector-button").click();
  assert.equal(await page.locator('#v-plot [data-arrow="source-v"]').count(), 0);
  assert.equal(await page.locator('#w-plot [data-arrow="image-v"]').count(), 0);

  const clearedVPlot = await plotSignature(page, "#v-plot");
  await setVector(page, "3/2", "-2");
  assert.notEqual(await plotSignature(page, "#v-plot"), clearedVPlot);
  assert.equal(await page.locator('#w-plot [data-arrow="image-v"]').count(), 1);

  const previousVPlot = await plotSignature(page, "#v-plot");
  await page.locator("#vector-x").fill("1e2");
  await page.locator("#vector-y").fill("0");
  await page.locator("#set-vector-button").click();
  assert.equal(
    await plotSignature(page, "#v-plot"),
    previousVPlot,
    "Scientific notation must not replace the last applied vector."
  );
  assert.equal(await page.locator("#vector-x").getAttribute("aria-invalid"), "true");

  await setVector(page, "2", "1");

  await assertClickSnapsWithoutHoverPreview(page);
  await setVector(page, "2", "1");
}

async function assertClickSnapsWithoutHoverPreview(page) {
  const clickPoint = await page.locator("#v-plot").evaluate((svg) => {
    const e1 = svg.querySelector('[data-arrow="basis-e1"] line');
    const e2 = svg.querySelector('[data-arrow="basis-e2"] line');
    const matrix = svg.getScreenCTM();
    if (!e1 || !e2 || !matrix || !(svg instanceof SVGSVGElement)) {
      return null;
    }
    const origin = {
      x: Number(e1.getAttribute("x1")),
      y: Number(e1.getAttribute("y1"))
    };
    const target = {
      x:
        origin.x +
        1.6 * (Number(e1.getAttribute("x2")) - origin.x) -
        1.4 * (Number(e2.getAttribute("x2")) - Number(e2.getAttribute("x1"))),
      y:
        origin.y +
        1.6 * (Number(e1.getAttribute("y2")) - origin.y) -
        1.4 * (Number(e2.getAttribute("y2")) - Number(e2.getAttribute("y1")))
    };
    const point = svg.createSVGPoint();
    point.x = target.x;
    point.y = target.y;
    const client = point.matrixTransform(matrix);
    return { x: client.x, y: client.y };
  });
  assert.ok(clickPoint);

  await page.mouse.move(clickPoint.x, clickPoint.y);
  await page.waitForTimeout(50);
  assert.equal(await page.locator("#v-plot [data-preview]").count(), 0);
  assert.equal(await page.locator('#v-plot [data-label="snap-preview-label"]').count(), 0);

  await page.mouse.click(clickPoint.x, clickPoint.y);
  assert.equal(await page.locator("#vector-x").inputValue(), "2");
  assert.equal(await page.locator("#vector-y").inputValue(), "-1");
}

async function assertSingularBasisAndRecovery(page) {
  const imageBeforeBasisChange = await imageGeometrySignature(page);
  await setBasis(page, ["1", "1", "2", "2"]);
  assert.match(normalizeText(await page.locator("#basis-status").textContent()), /not a basis/i);

  const unavailableText = normalizeText(await page.locator("#representation-matrix").textContent());
  assert.match(unavailableText, /(unavailable|does not exist|not a basis)/i);
  assert.equal(
    await imageGeometrySignature(page),
    imageBeforeBasisChange,
    "Changing only B_W must not move ambient image vectors."
  );

  await setBasis(page, ["1", "1", "-1", "1"]);
  assert.match(normalizeText(await page.locator("#basis-status").textContent()), /valid basis/i);
  await assertDefaultRepresentation(page);
}

async function assertSourceBasisWorkflow(page) {
  const matrix = page.locator("#representation-matrix");
  const matrixBefore = await matrix.getAttribute("data-matrix");
  const sourceImagesBefore = await arrowGeometrySignature(page, ["image-e1", "image-e2"]);
  const vectorImageBefore = await arrowGeometrySignature(page, ["image-v"]);
  const equationsBefore = await assertMatrixComponentEquations(page, [
    "1/2,-1/2",
    "3/2,-1/2"
  ]);

  await setSourceBasis(page, ["2", "1", "-1", "1"]);
  assert.match(normalizeText(await page.locator("#source-basis-status").textContent()), /valid basis/i);
  const updatedMatrix = await matrix.getAttribute("data-matrix");
  assert.notEqual(updatedMatrix, matrixBefore, "Changing B_V must change the representation matrix.");
  assert.deepEqual(
    matrixColumns(updatedMatrix ?? ""),
    [
      ["5/2", "-3/2"],
      ["1", "0"]
    ]
  );
  assert.notDeepEqual(
    await assertMatrixComponentEquations(page, ["5/2,-3/2", "1,0"]),
    equationsBefore,
    "The displayed B_W coordinate columns of f(e_i) must follow B_V updates."
  );
  assert.notEqual(
    await arrowGeometrySignature(page, ["image-e1", "image-e2"]),
    sourceImagesBefore,
    "Changing B_V must change f(e₁) and f(e₂)."
  );
  assert.equal(
    await arrowGeometrySignature(page, ["image-v"]),
    vectorImageBefore,
    "Changing B_V must not move the ambient vector f(v)."
  );

  await setSourceBasis(page, ["1", "1", "2", "2"]);
  assert.match(normalizeText(await page.locator("#source-basis-status").textContent()), /not a basis/i);
  assert.match(
    normalizeText(await matrix.textContent()),
    /(unavailable|does not exist|not a basis|B.?V)/i
  );
  assert.equal(
    await arrowGeometrySignature(page, ["image-v"]),
    vectorImageBefore,
    "A singular B_V candidate must not move f(v)."
  );

  await setSourceBasis(page, ["1", "0", "0", "1"]);
  assert.match(normalizeText(await page.locator("#source-basis-status").textContent()), /valid basis/i);
  await assertDefaultRepresentation(page);
}

async function assertFitView(page) {
  await setVector(page, "24", "-17");
  await assertSharedPlotContract(page);
  const expandedBounds = await page.locator("#v-plot").getAttribute("data-bounds");
  assert.notEqual(expandedBounds, "-5,5,-5,5");

  await setVector(page, "2", "1");
  assert.equal(
    await page.locator("#v-plot").getAttribute("data-bounds"),
    "-5,5,-5,5",
    "Automatic fitting must return to the tight shared default view."
  );
  await assertSharedPlotContract(page);
  assert.equal(await page.locator("#fit-view-button").count(), 0);
}

async function assertResponsiveLayout(page) {
  const viewports = [
    { width: 1440, height: 1000, mode: "wide" },
    { width: 900, height: 800, mode: "tablet" },
    { width: 390, height: 844, mode: "mobile" }
  ];

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const mapForm = document.querySelector("#map-form")?.getBoundingClientRect();
      const banner = document.querySelector(".matrix-banner")?.getBoundingClientRect();
      const matrixOutput = document.querySelector("#representation-matrix");
      const matrix = matrixOutput?.querySelector(".katex-html")?.getBoundingClientRect();
      const componentRow = document.querySelector(".matrix-component-equations");
      const componentE1Element = document.querySelector("#matrix-component-e1");
      const componentE2Element = document.querySelector("#matrix-component-e2");
      const componentE1 = componentE1Element?.getBoundingClientRect();
      const componentE2 = componentE2Element?.getBoundingClientRect();
      const vPlot = document.querySelector("#v-plot")?.getBoundingClientRect();
      const wPlot = document.querySelector("#w-plot")?.getBoundingClientRect();
      const vectorX = document.querySelector("#vector-x")?.getBoundingClientRect();
      const vectorY = document.querySelector("#vector-y")?.getBoundingClientRect();
      const componentE1Math = componentE1Element?.querySelector(".katex");
      const componentE2Math = componentE2Element?.querySelector(".katex");
      return mapForm && banner && matrix && componentRow && componentE1 && componentE2 && componentE1Math && componentE2Math && vPlot && wPlot && vectorX && vectorY
        ? {
            mapForm: rect(mapForm),
            banner: rect(banner),
            matrix: rect(matrix),
            componentRow: {
              ...rect(componentRow.getBoundingClientRect()),
              clientWidth: componentRow.clientWidth,
              scrollWidth: componentRow.scrollWidth
            },
            componentE1: rect(componentE1),
            componentE2: rect(componentE2),
            componentGroup: {
              x: Math.min(componentE1.x, componentE2.x),
              y: Math.min(componentE1.y, componentE2.y),
              right: Math.max(componentE1.right, componentE2.right),
              bottom: Math.max(componentE1.bottom, componentE2.bottom),
              width: Math.max(componentE1.right, componentE2.right) - Math.min(componentE1.x, componentE2.x),
              height: Math.max(componentE1.bottom, componentE2.bottom) - Math.min(componentE1.y, componentE2.y)
            },
            componentFontSizes: [
              Number.parseFloat(getComputedStyle(componentE1Math).fontSize),
              Number.parseFloat(getComputedStyle(componentE2Math).fontSize)
            ],
            vPlot: rect(vPlot),
            wPlot: rect(wPlot),
            vectorX: rect(vectorX),
            vectorY: rect(vectorY),
            scrollWidth: document.documentElement.scrollWidth
          }
        : null;

      function rect(value) {
        return {
          x: value.x,
          y: value.y,
          width: value.width,
          height: value.height,
          right: value.right,
          bottom: value.bottom
        };
      }
    });

    assert.ok(layout);
    assert.ok(layout.scrollWidth <= viewport.width + 1, `${viewport.mode} layout must not overflow.`);
    assert.ok(layout.vPlot.width > 0 && layout.wPlot.width > 0);
    assert.ok(Math.abs(layout.vPlot.width - layout.wPlot.width) <= 6);
    assert.ok(
      layout.vectorX.bottom <= layout.vectorY.y + 1,
      "Vector coordinate inputs must stay stacked in one column."
    );
    assert.ok(Math.abs(layout.vectorX.x - layout.vectorY.x) <= 6);
    const matrixCenterX = layout.matrix.x + layout.matrix.width / 2;
    const matrixCenterY = layout.matrix.y + layout.matrix.height / 2;
    const bannerCenter = layout.banner.x + layout.banner.width / 2;
    if (viewport.mode === "wide") {
      assert.ok(
        Math.abs(matrixCenterX - bannerCenter) <= 1,
        `The representation matrix must stay horizontally centered within 1px in the wide visualization banner; measured ${Math.abs(matrixCenterX - bannerCenter)}px.`
      );
    }
    const minimumComponentFontSize = viewport.mode === "wide" ? 20 : viewport.mode === "tablet" ? 18 : 17;
    for (const [index, fontSize] of layout.componentFontSizes.entries()) {
      assert.ok(
        Number.isFinite(fontSize) && fontSize >= minimumComponentFontSize,
        `f(e_${index + 1}) coordinates must remain clearly readable in the ${viewport.mode} layout; expected at least ${minimumComponentFontSize}px, received ${fontSize}px.`
      );
    }
    assert.ok(
      layout.componentE1.right <= layout.componentE2.x + 1,
      `The two f(e_i) coordinate columns must stay side by side in the ${viewport.mode} layout.`
    );
    assert.ok(
      layout.componentGroup.x >= layout.matrix.right + 3,
      `The f(e_i) coordinate columns must sit to the right of A in the ${viewport.mode} layout; matrix right edge ${layout.matrix.right}px, component left edge ${layout.componentGroup.x}px.`
    );
    assert.ok(
      layout.componentRow.scrollWidth <= layout.componentRow.clientWidth + 1,
      `Both f(e_i) coordinate columns must be fully visible without horizontal scrolling in the ${viewport.mode} layout; scroll width ${layout.componentRow.scrollWidth}px, client width ${layout.componentRow.clientWidth}px.`
    );
    const componentE1Center = layout.componentE1.y + layout.componentE1.height / 2;
    const componentE2Center = layout.componentE2.y + layout.componentE2.height / 2;
    assert.ok(
      Math.abs(componentE1Center - componentE2Center) <= 4,
      `The two f(e_i) coordinate columns must stay on the same line in the ${viewport.mode} layout.`
    );
    const componentGroupCenterY = layout.componentGroup.y + layout.componentGroup.height / 2;
    assert.ok(
      layout.componentGroup.y < layout.matrix.bottom && layout.componentGroup.bottom > layout.matrix.y,
      `The f(e_i) coordinate columns must vertically overlap A instead of dropping below it in the ${viewport.mode} layout.`
    );
    assert.ok(
      Math.abs(componentGroupCenterY - matrixCenterY) <= 8,
      `A and the f(e_i) coordinate columns must share one horizontal line in the ${viewport.mode} layout; their centers differ by ${Math.abs(componentGroupCenterY - matrixCenterY)}px.`
    );
    assert.ok(
      layout.matrix.y <= Math.min(layout.vPlot.y, layout.wPlot.y),
      "The representation matrix banner must stay above the plot canvases."
    );

    if (viewport.mode === "wide") {
      assert.ok(layout.mapForm.x < layout.vPlot.x, "Wide controls must form a left column.");
      assert.ok(layout.vPlot.x < layout.wPlot.x, "Wide plots must be side by side.");
      assert.ok(Math.abs(layout.vPlot.y - layout.wPlot.y) <= 6);
    } else if (viewport.mode === "tablet") {
      assert.ok(layout.mapForm.y < layout.vPlot.y, "Tablet controls must move above the plots.");
      assert.ok(layout.vPlot.x < layout.wPlot.x, "Tablet plots must remain side by side.");
      assert.ok(Math.abs(layout.vPlot.y - layout.wPlot.y) <= 6);
    } else {
      assert.ok(layout.mapForm.y < layout.vPlot.y, "Mobile controls must precede the plots.");
      assert.ok(layout.vPlot.y < layout.wPlot.y, "Mobile plots must stack V above W.");
      assert.ok(layout.vPlot.width <= viewport.width && layout.wPlot.width <= viewport.width);
    }
    await assertSharedPlotContract(page);
    await assertPlotLabelPills(page, "dark");
  }
}

async function assertSharedPlotContract(page) {
  const [vPlot, wPlot] = await Promise.all([
    page.locator("#v-plot").evaluate(readPlotContract),
    page.locator("#w-plot").evaluate(readPlotContract)
  ]);
  assert.ok(vPlot.width > 0 && vPlot.height > 0 && wPlot.width > 0 && wPlot.height > 0);
  if (vPlot.bounds !== null || wPlot.bounds !== null) {
    assert.equal(vPlot.bounds, wPlot.bounds, "V and W must expose identical linked bounds.");
  }
  assert.ok(vPlot.finite && wPlot.finite, "Plot geometry must contain only finite coordinates.");

  function readPlotContract(svg) {
    const box = svg.getBoundingClientRect();
    const finite = [...svg.querySelectorAll("*")].every((node) =>
      [...node.attributes].every((attribute) => !/(?:NaN|Infinity)/i.test(attribute.value))
    );
    return {
      width: box.width,
      height: box.height,
      bounds: svg.getAttribute("data-bounds"),
      finite
    };
  }
}

async function imageGeometrySignature(page) {
  return arrowGeometrySignature(page, ["image-e1", "image-e2", "image-v"]);
}

async function arrowGeometrySignature(page, names) {
  const explicitImages = page.locator(
    names.map((name) => `#w-plot [data-arrow="${name}"]`).join(", ")
  );
  assert.equal(
    await explicitImages.count(),
    names.length,
    `Expected the W plot arrows ${names.join(", ")}.`
  );
  if ((await explicitImages.count()) > 0) {
    return page.locator("#w-plot").evaluate((svg, arrowNames) => {
      const bounds = svg.getAttribute("data-bounds")?.split(",").map(Number);
      const extent = bounds?.[1] ?? 1;
      return arrowNames.map((name) => {
        const node = svg.querySelector(`[data-arrow="${name}"]`);
        const line = node?.querySelector("line");
        if (node === null) {
          return `${name}:missing`;
        }
        if (line !== null && line !== undefined) {
          const x1 = Number(line.getAttribute("x1"));
          const y1 = Number(line.getAttribute("y1"));
          const x2 = Number(line.getAttribute("x2"));
          const y2 = Number(line.getAttribute("y2"));
          // Normalize arrow deltas by the automatically fitted extent. This
          // compares ambient vectors even when another endpoint changes the
          // shared plot scale. Querying from the live SVG in one evaluation
          // also avoids retaining groups detached by a ResizeObserver frame.
          return `${name}:${((x2 - x1) * extent).toFixed(4)}:${((y2 - y1) * extent).toFixed(4)}`;
        }
        return `${name}:zero`;
      }).join("|");
    }, names);
  }
  return page.locator("#w-plot").getAttribute("data-image-geometry");
}

async function plotSignature(page, selector) {
  return page.locator(selector).evaluate((svg) => svg.innerHTML);
}

async function setMap(page, [m11, m12, m21, m22]) {
  await page.locator("#map-11").fill(m11);
  await page.locator("#map-12").fill(m12);
  await page.locator("#map-21").fill(m21);
  await page.locator("#map-22").fill(m22);
  await page.locator("#apply-map-button").click();
}

async function setBasis(page, [firstX, firstY, secondX, secondY]) {
  await page.locator("#basis-first-x").fill(firstX);
  await page.locator("#basis-first-y").fill(firstY);
  await page.locator("#basis-second-x").fill(secondX);
  await page.locator("#basis-second-y").fill(secondY);
  await page.locator("#update-basis-button").click();
}

async function setSourceBasis(page, [firstX, firstY, secondX, secondY]) {
  await page.locator("#source-basis-first-x").fill(firstX);
  await page.locator("#source-basis-first-y").fill(firstY);
  await page.locator("#source-basis-second-x").fill(secondX);
  await page.locator("#source-basis-second-y").fill(secondY);
  await page.locator("#update-source-basis-button").click();
}

async function setVector(page, x, y) {
  await page.locator("#vector-x").fill(x);
  await page.locator("#vector-y").fill(y);
  await page.locator("#vector-y").press("Enter");
}

async function restoreDefaults(page) {
  await setMap(page, ["1", "2", "0", "1"]);
  await setSourceBasis(page, ["1", "0", "0", "1"]);
  await setBasis(page, ["1", "1", "-1", "1"]);
  await setVector(page, "2", "1");
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark") {
    await page.locator("#theme-toggle").click();
  }
}

async function assertUniqueVisible(page, selector) {
  const locator = page.locator(selector);
  assert.equal(await locator.count(), 1, `${selector} must be unique.`);
  assert.equal(await locator.isVisible(), true, `${selector} must be visible.`);
}

async function readMathSource(locator) {
  const annotation = locator.locator(".katex-mathml annotation");
  return normalizeMath(
    (await annotation.count()) > 0 ? await annotation.first().textContent() : await locator.textContent()
  );
}

function normalizeText(value) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function normalizeMath(value) {
  return (value ?? "").replace(/\s+/g, "");
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Preview server exited early with code ${child.exitCode}.`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The preview server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function waitForExit(child) {
  if (child.exitCode !== null) {
    return;
  }
  await new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
}
