export type View = "dashboard" | "workspace";
export type DisplayMode = "grid" | "list";
export type Theme = "light" | "dark";

export interface EventDocument {
  id: string;
  name: string;
  mimeType: string;
  url: string;    // data URL for v1 — migrate to Supabase Storage later
  size: number;
  uploadedAt: string;
}

export interface TravelEvent {
  id: string;
  type: "flight" | "hotel" | "activity" | "dining";
  date: string;
  time: string;
  endTime?: string;
  title: string;
  location: string;
  supplier?: string;
  price?: string;
  confNumber?: string;
  image?: string;
  roomType?: string;
  airline?: string;
  flightNum?: string;
  terminal?: string;
  arrTerminal?: string;
  seatDetails?: string;
  duration?: string;
  status?: string;
  checkin?: string;
  checkout?: string;
  notes?: string;
  media?: Array<{ type: "image" | "video"; url: string; name: string }>;
  documents?: EventDocument[];
}

export interface TripMedia {
  id: string;
  type: "image" | "video";
  name: string;
  url: string;
  size: number;
  uploadedAt: string;
  uploadedBy?: string;
}

export interface Trip {
  id: string;
  name: string;
  attendees: string;
  destination?: string;
  paxCount?: string;
  tripType?: string;
  budget?: string;
  currency?: string;
  start: string;
  end: string;
  status: "Draft" | "Published" | "In Progress";
  image: string;
  events: TravelEvent[];
  media?: TripMedia[];
}

export interface ComplianceDoc {
  name: string;
  status: "Signed" | "Pending" | "Expired" | "Not Required";
  date?: string; // last updated / signed date
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar: string;
  initials: string;
  status: "Active" | "Away" | "Offline";
  compliance?: ComplianceDoc[];
}

export interface Notification {
  id: string;
  message: string;
  detail: string;
  time: string;
  read: boolean;
  type: "info" | "success" | "warning";
}
