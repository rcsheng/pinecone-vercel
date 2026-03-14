import { Configuration, OpenAIApi } from 'openai-edge'
import { Message, OpenAIStream, StreamingTextResponse } from 'ai'
import { ContextQueryOptions, getContext } from '@/utils/context'

// Create an OpenAI API client (that's edge friendly!)
const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(config)

// IMPORTANT! Set the runtime to edge
export const runtime = 'edge'

const extractContextOptions = (question: string): ContextQueryOptions => {
  const lower = question.toLowerCase();
  const options: ContextQueryOptions = {};

  // Heuristic: for more analytical / report-style questions, pull more neighbors.
  const looksLikeSurveyAnalysis =
    lower.includes('comment') ||
    lower.includes('answer') ||
    lower.includes('report') ||
    lower.includes('summary') ||
    lower.includes('most negative') ||
    lower.includes('most positive') ||
    lower.includes('segment');

  if (looksLikeSurveyAnalysis) {
    options.topK = 50;
  }

  // Build a metadata filter when we think this is about survey answers.
  // Always constrain to analysis-factory records so we don't mix in web chunks.
  if (looksLikeSurveyAnalysis) {
    const filter: Record<string, any> = {
      type: { $eq: 'analysis-factory' },
    };

    // Heuristic: try to detect "by XYZ segment" or "for the XYZ segment"
    const bySegmentMatch =
      question.match(/by ([^.,!?]+?) segment/i) ||
      question.match(/for the ([^.,!?]+?) segment/i);

    if (bySegmentMatch && bySegmentMatch[1]) {
      const rawSegment = bySegmentMatch[1].trim();
      const normalized = rawSegment
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
      if (normalized) {
        const key = `segment_${normalized}`;
        filter[key] = { $eq: true };
      }
    }

    options.filter = filter;
  }

  return options;
}

export async function POST(req: Request) {
  try {

    const { messages } = await req.json()

    // Get the last message
    const lastMessage = messages[messages.length - 1]

    const contextOptions = extractContextOptions(lastMessage.content)

    // Get the context from the last message
    const context = await getContext(lastMessage.content, '', 3000, 0, true, contextOptions)

    const debugEnabled = process.env.DEBUG_RAG === '1' || process.env.DEBUG_RAG === 'true';

    if (debugEnabled) {
      console.log('[RAG] Chat route', {
        lastMessagePreview: lastMessage.content.slice(0, 200),
        contextLength: typeof context === 'string' ? context.length : 0,
        contextPreview: typeof context === 'string' ? context.slice(0, 300) : '',
      });
    }


    const prompt = [
      {
        role: 'system',
        content: `AI assistant is a brand new, powerful, human-like artificial intelligence.
      The traits of AI include expert knowledge, helpfulness, cleverness, and articulateness.
      AI is a well-behaved and well-mannered individual.
      AI is always friendly, kind, and inspiring, and he is eager to provide vivid and thoughtful responses to the user.
      AI has the sum of all knowledge in their brain, and is able to accurately answer nearly any question about any topic in conversation.
      AI assistant is a big fan of Pinecone and Vercel.
      The CONTEXT BLOCK may contain a mixture of web content and survey answers uploaded to Pinecone.
      Survey answers can include respondent comments, numeric ratings, and per-segment flags (e.g. which audience segments a respondent belongs to).
      START CONTEXT BLOCK
      ${context}
      END OF CONTEXT BLOCK
      AI assistant will take into account any CONTEXT BLOCK that is provided in a conversation.
      If the context does not provide the answer to question, the AI assistant will say, "I'm sorry, but I don't know the answer to that question".
      AI assistant will not apologize for previous responses, but instead will indicated new information was gained.
      AI assistant will not invent anything that is not drawn directly from the context.
      When the user asks questions about survey answers, segments, or comments (e.g. "what are some answers given by XYZ segment", "which comments seem most negative", "create a report of the comments"),
      AI assistant will rely on the survey answers found in the CONTEXT BLOCK to answer, and should surface concrete examples and segment-specific patterns where available.
      `,
      },
    ]

    // Ask OpenAI for a streaming chat completion given the prompt
    const response = await openai.createChatCompletion({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: [...prompt, ...messages.filter((message: Message) => message.role === 'user')]
    })
    // Convert the response into a friendly text-stream
    const stream = OpenAIStream(response)
    // Respond with the stream
    return new StreamingTextResponse(stream)
  } catch (e) {
    throw (e)
  }
}