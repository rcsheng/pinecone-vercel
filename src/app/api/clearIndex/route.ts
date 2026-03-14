import { NextResponse } from "next/server";
import { Pinecone } from '@pinecone-database/pinecone'

export async function POST() {
  // Instantiate a new Pinecone client
  const pinecone = new Pinecone();
  // Select the desired index
  const index = pinecone.Index(process.env.PINECONE_INDEX!)

  // Use the custom namespace, if provided, otherwise use the default
  const namespaceName = process.env.PINECONE_NAMESPACE ?? ''
  const namespace = index.namespace(namespaceName)

  // Delete everything within the namespace (ignore 404 — namespace may already be empty)
  try {
    await namespace.deleteAll();
  } catch (e: any) {
    if (e?.name !== 'PineconeNotFoundError') throw e;
  }

  return NextResponse.json({
    success: true
  })
}
