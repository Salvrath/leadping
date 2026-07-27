export type LaunchMode = "validation" | "commerce";

export function getLaunchMode(env: NodeJS.ProcessEnv = process.env): LaunchMode {
  return env.TEXTBACK_COMMERCE_ENABLED === "true" ? "commerce" : "validation";
}

export function isCommerceEnabled(env: NodeJS.ProcessEnv = process.env) {
  return getLaunchMode(env) === "commerce";
}
