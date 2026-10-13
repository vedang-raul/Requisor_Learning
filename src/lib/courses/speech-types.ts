/** Client-safe metadata only. Provider IDs and spoken content stay on the server. */
export type ApprovedSpeechKey = "preview" | "platform_help" | "study_tip";
export interface PublicSpeechVoice {
  key: string;
  name: string;
  gender: "male" | "female";
  languages: string[];
  enabled: boolean;
  default: boolean;
  unavailableReason: string | null;
}
export interface SpeechCatalogResponse {
  voices: PublicSpeechVoice[];
  setupMessage: string | null;
}
