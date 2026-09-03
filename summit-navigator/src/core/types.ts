/** A single kind of program entry. Breaks and socials render dimmed. */
export type SessionKind =
  | 'keynote'
  | 'panel'
  | 'talks'
  | 'workshop'
  | 'papers'
  | 'break'
  | 'social';

export interface Track {
  id: string;
  name: string;
  /** CSS color used for the track chip; must contrast with white text. */
  color: string;
}

export interface Session {
  id: string;
  /** YYYY-MM-DD, a member of ScheduleData.days, in the conference time zone. */
  day: string;
  /** HH:MM 24-hour wall time in the conference time zone. */
  start: string;
  /** HH:MM 24-hour wall time, strictly after start. */
  end: string;
  title: string;
  kind: SessionKind;
  /** Track id; must exist in ScheduleData.tracks. */
  track: string;
  room: string;
  speakers: string[];
  description?: string;
  invitationOnly?: boolean;
}

export interface ConferenceInfo {
  name: string;
  shortName: string;
  venue: string;
  city: string;
  /** IANA time zone the schedule's wall times are expressed in. */
  timeZone: string;
  website: string;
  /** Provenance note shown in the app footer. */
  dataNote: string;
}

export interface ScheduleData {
  conference: ConferenceInfo;
  tracks: Track[];
  /** Sorted list of YYYY-MM-DD conference days. */
  days: string[];
  sessions: Session[];
}

/** Sessions sharing one start time, for the grouped day listing. */
export interface TimeBlock {
  start: string;
  sessions: Session[];
}
