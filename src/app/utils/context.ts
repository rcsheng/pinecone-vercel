import { ScoredPineconeRecord } from "@pinecone-database/pinecone";
import { getMatchesFromEmbeddings } from "./pinecone";
import { getEmbeddings } from './embeddings'

export type Metadata = {
  url: string,
  text: string,
  chunk: string,
}

// The function `getContext` is used to retrieve the context of a given message
export const getContext = async (
  message: string,
  namespace: string,
  maxTokens = 3000,
  minScore = 0.7,
  getOnlyText = true
): Promise<string | ScoredPineconeRecord[]> => {
  const debugEnabled = process.env.DEBUG_RAG === '1' || process.env.DEBUG_RAG === 'true';

  if (debugEnabled) {
    console.log('[RAG] getContext called', {
      namespace,
      maxTokens,
      minScore,
      getOnlyText,
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
  const matches = await getMatchesFromEmbeddings(embedding, 3, namespace);

  if (debugEnabled) {
    console.log('[RAG] Pinecone matches', {
      totalMatches: matches.length,
      topMatches: matches.slice(0, 5).map((m) => ({
        id: m.id,
        score: m.score,
        url: (m.metadata as Metadata | undefined)?.url,
        chunkPreview: ((m.metadata as Metadata | undefined)?.chunk || '').slice(0, 160),
      })),
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

  const docs = matches ? qualifyingDocs.map(match => (match.metadata as Metadata).chunk) : [];
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
