import { ScoredPineconeRecord } from "@pinecone-database/pinecone";
import { getMatchesFromEmbeddings } from "./pinecone";
import { getEmbeddings } from './embeddings'

// Original website-chunking metadata
export type WebMetadata = {
  url: string;
  text: string;
  chunk: string;
};

// Analysis Factory metadata (survey answers)
export type AnalysisMetadata = {
  type: "analysis-factory";
  question: string;
  answer: string;
  weight: number;
  // plus dynamic segment_* boolean flags and any other fields
  [key: string]: string | number | boolean;
};

export type Metadata = WebMetadata | AnalysisMetadata | Record<string, any>;

// The function `getContext` is used to retrieve the context of a given message
export type ContextQueryOptions = {
  topK?: number;
  filter?: Record<string, any>;
};

export const getContext = async (
  message: string,
  namespace: string,
  maxTokens = 3000,
  minScore = 0,
  getOnlyText = true,
  options: ContextQueryOptions = {}
): Promise<string | ScoredPineconeRecord[]> => {
  const debugEnabled = process.env.DEBUG_RAG === '1' || process.env.DEBUG_RAG === 'true';

  const { topK = 3, filter } = options;

  if (debugEnabled) {
    console.log('[RAG] getContext called', {
      namespace,
      maxTokens,
      minScore,
      getOnlyText,
      topK,
      filter,
      messagePreview: message.slice(0, 200),
    });
  }

  // Get the embeddings of the input message
  const embedding = await getEmbeddings(message);

  if (debugEnabled) {
    console.log('[RAG] Embedding generated', {
      embeddingLength: embedding.length,
    });
  }

  // Retrieve the matches for the embeddings from the specified namespace
  const matches = await getMatchesFromEmbeddings(embedding, topK, namespace, filter);

  if (debugEnabled) {
    console.log('[RAG] Pinecone matches', {
      totalMatches: matches.length,
      topMatches: matches.slice(0, 5).map((m) => {
        const meta = (m.metadata || {}) as Metadata & { url?: string; chunk?: string; answer?: string };
        const chunkLike = (meta as any).chunk || (meta as any).answer || "";
        return {
          id: m.id,
          score: m.score,
          url: (meta as any).url,
          chunkPreview: String(chunkLike).slice(0, 160),
        };
      }),
    });
  }

  // Filter out the matches that have a score lower than the minimum score
  const qualifyingDocs = matches.filter(m => m.score && m.score > minScore);

  if (debugEnabled) {
    console.log('[RAG] Qualifying docs after score filter', {
      qualifyingCount: qualifyingDocs.length,
      minScore,
      scores: qualifyingDocs.map((d) => d.score),
    });
  }

  if (!getOnlyText) {
    return qualifyingDocs;
  }

  const docs = matches
    ? qualifyingDocs
        .map((match) => {
          const meta = (match.metadata || {}) as Metadata;

          // 1. Original website content: use `chunk` when present
          if (typeof (meta as any).chunk === "string" && (meta as any).chunk.length > 0) {
            return (meta as any).chunk as string;
          }

          // 2. Analysis Factory answers: build a compact text block
          const hasAnalysisShape =
            (meta as any).type === "analysis-factory" ||
            (typeof (meta as any).answer === "string" && (meta as any).answer.length > 0);

          if (hasAnalysisShape) {
            const answer = (meta as any).answer as string | undefined;
            const question = (meta as any).question as string | undefined;
            const weight = (meta as any).weight as number | undefined;

            const segmentKeys =
              Object.keys(meta).filter(
                (k) => k.startsWith("segment_") && (meta as any)[k] === true
              ) || [];

            const parts: string[] = [];
            if (question) parts.push(`Question: ${question}`);
            if (answer) parts.push(`Answer: ${answer}`);
            if (typeof weight === "number") parts.push(`Weight: ${weight}`);
            if (segmentKeys.length > 0) {
              parts.push(`Segments: ${segmentKeys.join(", ")}`);
            }

            if (parts.length > 0) {
              return parts.join("\n");
            }
          }

          // 3. Fallback to plain text field if present
          if (typeof (meta as any).text === "string" && (meta as any).text.length > 0) {
            return (meta as any).text as string;
          }

          return "";
        })
        .filter((s) => s && s.length > 0)
    : [];
  const joined = docs.join("\n").substring(0, maxTokens);

  if (debugEnabled) {
    console.log('[RAG] Final context stats', {
      docsCount: docs.length,
      contextLength: joined.length,
      contextPreview: joined.slice(0, 300),
    });
  }

  // Join all the chunks of text together, truncate to the maximum number of tokens, and return the result
  return joined;
}
