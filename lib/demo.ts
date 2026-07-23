export type DemoStep="incoming"|"sending"|"sent"|"replied"|"lead";
export const nextDemoStep=(step:DemoStep):DemoStep=>({incoming:"sending",sending:"sent",sent:"replied",replied:"lead",lead:"incoming"}[step] as DemoStep);
