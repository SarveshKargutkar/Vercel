export type Phase = "lobby" | "night" | "dawn" | "day" | "vote" | "ended";
export type Role = "mafia" | "detective" | "doctor" | "villager";

export type Room = {
  id: string;
  code: string;
  phase: Phase;
  day: number;
  phase_ends_at: string | null;
  host_user: string;
  winner: "mafia" | "village" | null;
  cfg_mafia: number;
  cfg_detective: number;
  cfg_doctor: number;
};

export type Player = {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  seat: number;
  alive: boolean;
  last_seen: string;
};

export type GameEvent = { id: number; day: number; body: string; created_at: string };
export type PrivateResult = { id: number; body: string; created_at: string };
export type Vote = { voter: string; target: string; day: number };
export type Message = {
  id: number;
  player_id: string;
  channel: "day" | "mafia";
  body: string;
  created_at: string;
};

export const ROLE_LABEL: Record<Role, string> = {
  mafia: "Mafia",
  detective: "Detective",
  doctor: "Doctor",
  villager: "Villager",
};

/** The one line a player should read at the top of the screen. */
export function instruction(
  phase: Phase,
  role: Role | null,
  alive: boolean,
): string {
  if (!alive) return "You're out. Watch quietly — no talking.";
  switch (phase) {
    case "lobby":
      return "Waiting for everyone to join.";
    case "night":
      if (role === "mafia") return "Pick someone to eliminate.";
      if (role === "detective") return "Pick someone to investigate.";
      if (role === "doctor") return "Pick someone to protect.";
      return "Eyes closed. Sit tight until morning.";
    case "dawn":
      return "Morning breaks…";
    case "day":
      return "Talk it out. Who seems off?";
    case "vote":
      return "Tap the player you want to eliminate.";
    case "ended":
      return "Game over.";
  }
}

/** Only these roles tap someone at night. */
export function actsAtNight(role: Role | null) {
  return role === "mafia" || role === "detective" || role === "doctor";
}
