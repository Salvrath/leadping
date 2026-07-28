export type AdminActionState = {
  status: "idle" | "success" | "error";
  message: string;
  completedAt?: number;
};

export const initialAdminActionState: AdminActionState = {
  status: "idle",
  message: "",
};

export function adminActionSuccess(message: string): AdminActionState {
  return { status: "success", message, completedAt: Date.now() };
}

export function adminActionError(message: string): AdminActionState {
  return { status: "error", message, completedAt: Date.now() };
}
