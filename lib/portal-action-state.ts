export type PortalActionState = {
  status: "idle" | "success" | "error";
  message: string;
  completedAt?: number;
};

export const initialPortalActionState: PortalActionState = {
  status: "idle",
  message: "",
};
