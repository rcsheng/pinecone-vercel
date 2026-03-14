import { NextResponse } from "next/server";
import { Pinecone, type PineconeRecord } from "@pinecone-database/pinecone";
import { getEmbeddings } from "@/utils/embeddings";
import { chunkedUpsert } from "@/utils/chunkedUpsert";
import md5 from "md5";

type UploadRespondent = {
  id: string;
  answer: string;
  weight: number;
  segments: string[];
};

type UploadPayload = {
  question: string;
  respondents: UploadRespondent[];
};

type AnalysisMetadataBase = {
  type: "analysis-factory";
  question: string;
  answer: string;
  weight: number;
};

// We add one boolean field per segment dynamically, e.g. `segment_environmentalists: true`.
type AnalysisMetadata = AnalysisMetadataBase & Record<string, string | number | boolean>;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as UploadPayload;

    if (!body.question || !body.respondents || body.respondents.length === 0) {
      return NextResponse.json(
        { error: "Missing question or respondents in payload." },
        { status: 400 }
      );
    }

    const indexName: string = process.env.PINECONE_INDEX || "";
    if (!indexName) {
      return NextResponse.json(
        { error: "PINECONE_INDEX environment variable not set." },
        { status: 500 }
      );
    }

    // Server-side debug logging so you can verify payload and target index
    console.log("[analysis-api] Incoming upload", {
      questionPreview: body.question.slice(0, 120),
      totalRespondents: body.respondents.length,
      indexName,
    });

    const pinecone = new Pinecone();
    const index = pinecone.Index<AnalysisMetadata>(indexName);

    const vectors: PineconeRecord<AnalysisMetadata>[] = [];

    // Build embeddings and vectors sequentially to keep things simple
    for (const respondent of body.respondents) {
      const text = [
        `Survey response for question: "${body.question}"`,
        `Answer: ${respondent.answer}`,
        `Weight: ${respondent.weight}`,
        respondent.segments.length > 0
          ? `Segments: ${respondent.segments.join(", ")}`
          : "Segments: (none)",
      ].join("\n");

      const embedding = await getEmbeddings(text);

      const id = md5(
        `${respondent.id}-${body.question}-${respondent.segments.join("|")}`
      );

      // Build one metadata flag per segment so we can filter quickly, e.g.
      // { segment_environmentalists: true }
      const segmentFlags: Record<string, boolean> = {};
      for (const rawSegment of respondent.segments) {
        if (!rawSegment) continue;
        const normalized = rawSegment
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "");
        if (!normalized) continue;
        const key = `segment_${normalized}`;
        segmentFlags[key] = true;
      }

      vectors.push({
        id,
        values: embedding,
        metadata: {
          type: "analysis-factory",
          question: body.question,
          answer: respondent.answer,
          weight: respondent.weight,
          ...segmentFlags,
        },
      });
    }

    // Upsert all vectors into the default namespace
    if (vectors.length > 0) {
      await chunkedUpsert(index, vectors, "", 50);
    }

    console.log("[analysis-api] Upsert complete", {
      upserted: vectors.length,
    });

    return NextResponse.json({ upserted: vectors.length });
  } catch (e) {
    console.error("Error uploading analysis data to Pinecone:", e);
    return NextResponse.json(
      { error: "Failed to upload analysis data to Pinecone." },
      { status: 500 }
    );
  }
}

