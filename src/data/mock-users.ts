import type { User } from "@/types";

export const MOCK_USERS: User[] = [
  {
    id: "u1", name: "Ash Murray", email: "ash.murray@dafadventures.com", role: "Lead Designer", avatar: "", initials: "AM", status: "Active",
    compliance: [
      { name: "Passport", status: "Signed", date: "2026-01-15" },
      { name: "Travel Insurance", status: "Signed", date: "2026-02-01" },
      { name: "Behavioural Agreement", status: "Signed", date: "2026-01-10" },
      { name: "Code of Conduct Review", status: "Signed", date: "2026-01-10" },
      { name: "Risk Assessment", status: "Signed", date: "2026-02-20" },
    ],
  },
  {
    id: "u2", name: "Jordan Blake", email: "jordan.blake@dafadventures.com", role: "Senior Agent", avatar: "", initials: "JB", status: "Active",
    compliance: [
      { name: "Passport", status: "Signed", date: "2025-12-05" },
      { name: "Travel Insurance", status: "Signed", date: "2026-01-20" },
      { name: "Behavioural Agreement", status: "Pending" },
      { name: "Code of Conduct Review", status: "Signed", date: "2025-11-30" },
      { name: "Risk Assessment", status: "Signed", date: "2026-01-25" },
    ],
  },
  {
    id: "u3", name: "Taylor Chen", email: "taylor.chen@dafadventures.com", role: "Product Manager", avatar: "", initials: "TC", status: "Away",
    compliance: [
      { name: "Passport", status: "Signed", date: "2025-10-12" },
      { name: "Travel Insurance", status: "Expired", date: "2025-06-01" },
      { name: "Behavioural Agreement", status: "Signed", date: "2025-09-15" },
      { name: "Code of Conduct Review", status: "Pending" },
      { name: "Risk Assessment", status: "Pending" },
    ],
  },
  {
    id: "u4", name: "Riley Okafor", email: "riley.okafor@dafadventures.com", role: "Travel Specialist", avatar: "", initials: "RO", status: "Active",
    compliance: [
      { name: "Passport", status: "Signed", date: "2026-03-01" },
      { name: "Travel Insurance", status: "Signed", date: "2026-03-01" },
      { name: "Behavioural Agreement", status: "Signed", date: "2026-02-28" },
      { name: "Code of Conduct Review", status: "Signed", date: "2026-02-28" },
      { name: "Risk Assessment", status: "Signed", date: "2026-03-05" },
    ],
  },
  {
    id: "u5", name: "Morgan Diaz", email: "morgan.diaz@dafadventures.com", role: "EU Sales Lead", avatar: "", initials: "MD", status: "Offline",
    compliance: [
      { name: "Passport", status: "Expired", date: "2024-11-30" },
      { name: "Travel Insurance", status: "Not Required" },
      { name: "Behavioural Agreement", status: "Signed", date: "2025-08-10" },
      { name: "Code of Conduct Review", status: "Signed", date: "2025-08-10" },
      { name: "Risk Assessment", status: "Not Required" },
    ],
  },
  {
    id: "u6", name: "Cameron Li", email: "cameron.li@dafadventures.com", role: "Content Creator", avatar: "", initials: "CL", status: "Active",
    compliance: [
      { name: "Passport", status: "Signed", date: "2026-01-22" },
      { name: "Travel Insurance", status: "Pending" },
      { name: "Behavioural Agreement", status: "Pending" },
      { name: "Code of Conduct Review", status: "Pending" },
      { name: "Risk Assessment", status: "Pending" },
    ],
  },
  {
    id: "u7", name: "Avery Singh", email: "avery.singh@dafadventures.com", role: "Executive Advisor", avatar: "", initials: "AS", status: "Away",
    compliance: [
      { name: "Passport", status: "Signed", date: "2026-02-14" },
      { name: "Travel Insurance", status: "Signed", date: "2026-02-14" },
      { name: "Behavioural Agreement", status: "Signed", date: "2026-02-10" },
      { name: "Code of Conduct Review", status: "Signed", date: "2026-02-10" },
      { name: "Risk Assessment", status: "Pending" },
    ],
  },
  {
    id: "u8", name: "Quinn Novak", email: "quinn.novak@dafadventures.com", role: "Operations Manager", avatar: "", initials: "QN", status: "Active",
    compliance: [
      { name: "Passport", status: "Signed", date: "2025-12-20" },
      { name: "Travel Insurance", status: "Signed", date: "2026-01-05" },
      { name: "Behavioural Agreement", status: "Signed", date: "2025-12-18" },
      { name: "Code of Conduct Review", status: "Signed", date: "2025-12-18" },
      { name: "Risk Assessment", status: "Signed", date: "2026-01-10" },
    ],
  },
];
