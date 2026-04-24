export type View = "dashboard" | "workspace";
export type DisplayMode = "grid" | "list";
export type Theme = "light" | "dark";

export interface EventDocument {
  id: string;
  name: string;
  mimeType: string;
  url: string;    // data URL for v1
  size: number;
  uploadedAt: string;
}

export interface TravelEvent {
  id: string;
  type: "flight" | "hotel" | "activity" | "dining" | "transfer";
  date: string;
  time: string;
  endTime?: string;
  title: string;
  description?: string;
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
  gate?: string;
  seatDetails?: string;
  duration?: string;
  status?: string;
  depAirport?: string;
  arrAirport?: string;
  checkin?: string;
  checkout?: string;
  notes?: string;
  media?: Array<{ type: "image" | "video"; url: string; name: string }>;
  documents?: EventDocument[];
  /** When undefined/empty = everyone on the trip sees this event. When populated = only these traveler IDs. */
  assignedTo?: string[];
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

export interface TripOrganizer {
  name: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
  avatar?: string;
}

export interface TripInfo {
  id: string;
  title: string;
  body: string;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
}

export interface OrgMember {
  id: string;
  organizationId: string;
  userId: string;
  role: "owner" | "admin" | "agent";
  joinedAt: string;
  profile?: User;
}

export type OrgRole = OrgMember["role"];

export interface Trip {
  id: string;
  name: string;
  attendees: string;
  organizationId?: string;
  /** Actual traveler IDs linked to this trip (source of truth for relationships) */
  travelerIds?: string[];
  /** Denormalized traveler display info — synced for shared view access */
  travelers?: Array<{ id: string; name: string; initials: string }>;
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
  shortCode?: string;
  organizer?: TripOrganizer;
  info?: TripInfo[];
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
