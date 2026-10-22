// One headless Chromium for every script that drives a page (site capture, the app's
// smoke test): the same browser Remotion renders with. In the cloud container that's
// the pre-installed one; on a Mac or PC it's the copy Remotion downloads on first use.

import { existsSync } from "node:fs";

const CLOUD = "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell";

export const browserPath = async () => {
  if (existsSync(CLOUD)) return CLOUD;
  const { ensureBrowser } = await import("@remotion/renderer");
  const status = await ensureBrowser();
  return status.path;
};

export const launch = async () => {
  const { chromium } = await import("playwright-core");
  return chromium.launch({
    executablePath: await browserPath(),
    args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
  });
};
