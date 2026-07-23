export type CalculatorInput={missed:number;relevant:number;margin:number;recovered:number};
export function calculateMonthlyValue({missed,relevant,margin,recovered}:CalculatorInput){return Math.round(missed*4.33*(relevant/100)*margin*(recovered/100));}
