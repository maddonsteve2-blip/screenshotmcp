export type ScreenshotEvidence = {
  type: "screenshot";
  url: string;
  caption?: string;
  timestamp: Date;
};

export type FindingEvidence = {
  type: "finding";
  category: "performance" | "seo" | "accessibility" | "ux";
  data: Record<string, unknown>;
  timestamp: Date;
};

export type EvidenceItem = ScreenshotEvidence | FindingEvidence;
