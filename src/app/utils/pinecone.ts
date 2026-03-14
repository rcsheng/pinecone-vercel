import { Pinecone, type ScoredPineconeRecord } from "@pinecone-database/pinecone";

export type Metadata = {
  url: string,
  text: string,
  chunk: string,
  hash: string
}

// The function `getMatchesFromEmbeddings` is used to retrieve matches for the given embeddings
const getMatchesFromEmbeddings = async (
  embeddings: number[],
  topK: number,
  namespace: string,
  filter?: Record<string, any>
): Promise<ScoredPineconeRecord<Metadata>[]> => {
  const debugEnabled = process.env.DEBUG_RAG === '1' || process.env.DEBUG_RAG === 'true';

  // Obtain a client for Pinecone
  const pinecone = new Pinecone();

  const indexName: string = process.env.PINECONE_INDEX || '';
  if (indexName === '') {
    throw new Error('PINECONE_INDEX environment variable not set');
  }

  // Retrieve the list of indexes to check if expected index exists
  const indexes = (await pinecone.listIndexes())?.indexes;
  if (!indexes || indexes.filter(i => i.name === indexName).length !== 1) {
    throw new Error(`Index ${indexName} does not exist`);
  }

  if (debugEnabled) {
    console.log('[RAG] Querying Pinecone', {
      indexName,
      namespace: namespace ?? '',
      topK,
      embeddingLength: embeddings.length,
    });
  }

  // Get the Pinecone index
  const index = pinecone!.Index<Metadata>(indexName);

  // Get the namespace
  const pineconeNamespace = index.namespace(namespace ?? '');

  try {
    // Query the index with the defined request
    const queryResult = await pineconeNamespace.query({
      vector: embeddings,
      topK,
      includeMetadata: true,
      filter,
    });

    if (debugEnabled) {
      console.log('[RAG] Pinecone raw query result', {
        matchesCount: queryResult.matches?.length ?? 0,
        namespace: namespace ?? '',
      });
    }

    return queryResult.matches || [];
  } catch (e) {
    // Log the error and throw it
    console.log("Error querying embeddings: ", e);
    throw new Error(`Error querying embeddings: ${e}`);
  }
}

export { getMatchesFromEmbeddings }