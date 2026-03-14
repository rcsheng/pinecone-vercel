
import { OpenAIApi, Configuration } from "openai-edge";

const config = new Configuration({
  apiKey: process.env.OPENAI_API_KEY
})
const openai = new OpenAIApi(config)

export async function getEmbeddings(input: string) {
  try {
    const response = await openai.createEmbedding({
      model: "text-embedding-3-small",
      input: input.replace(/\n/g, ' '),
      // dimensions: 1024
    })

    const result = await response.json();
    if (!response.ok || !result.data) {
      console.log("OpenAI API error response:", JSON.stringify(result));
      throw new Error(`OpenAI API error: ${result.error?.message ?? JSON.stringify(result)}`);
    }
    return result.data[0].embedding as number[]

  } catch (e) {
    console.log("Error calling OpenAI embedding API: ", e);
    throw new Error(`Error calling OpenAI embedding API: ${e}`);
  }
}