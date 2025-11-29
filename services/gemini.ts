import { GoogleGenAI, Modality } from "@google/genai";
import { ConsumerProfile, Article } from "../types";
import { base64ToUint8Array, decodeAudioData } from "./audioUtils";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// -- Producer Services --

export const assistProducer = async (
  topic: string, 
  currentContent: string, 
  mode: 'draft' | 'continue' | 'polish'
): Promise<string> => {
  const ai = getAI();
  let prompt = "";
  
  // Default topic if missing, but content is present
  const safeTopic = topic || "the provided content";
  
  switch(mode) {
    case 'draft':
      prompt = `Act as an expert domain knowledge producer. Write a comprehensive, well-structured article about: "${safeTopic}". Use Markdown formatting (headers, lists, bold text). Write at least 300 words.`;
      break;
    case 'continue':
      prompt = `Act as an expert co-author.
      Topic: "${safeTopic}"
      
      Current Article Content:
      """
      ${currentContent}
      """
      
      Task: Continue writing the article from where it stops. Add new insights, examples, or sections that logically follow. Do not repeat what is already written. Provide only the added content.`;
      break;
    case 'polish':
      prompt = `Act as an expert editor.
      Topic: "${safeTopic}"
      
      Draft Content:
      """
      ${currentContent}
      """
      
      Task: Polish this content. Fix grammar, improve flow, and make it sound authoritative and professional. Retain all factual information. Output the full rewritten article in Markdown.`;
      break;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: "You are an expert knowledge assistant helping a domain expert write a certified report. Be precise, professional, and factual.",
    }
  });
  
  return response.text || "";
};

// -- Consumer Services --

export const adaptContent = async (article: Article, profile: ConsumerProfile): Promise<string> => {
  const ai = getAI();
  const prompt = `
    Adapt the following article for a ${profile.expertise} level reader working in ${profile.role}.
    They have about ${profile.timeConstraint} to read this.
    
    Original Article Title: ${article.title}
    Original Content:
    """
    ${article.content}
    """
    
    Output structured markdown with sections suitable for this persona.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text || "";
};

export const adaptToComic = async (article: Article): Promise<string> => {
  const ai = getAI();
  const prompt = `
    Adapt the following article into a "Tintin" style comic book script (The Adventures of Tintin).
    
    Article Title: ${article.title}
    Article Content:
    """
    ${article.content}
    """
    
    Format:
    Create a script for a 1-page graphic novel (approx 6-9 panels).
    Style: Hergé's Ligne Claire descriptions. Adventure tone.
    
    Characters:
    - Tintin: 30 years old, youthful look but not a teenager. Smart reporter.
    - Captain Haddock: Man in his 40s. Black beard. Blue seaman sweater, black jacket, black pants, always wears a black captain's hat.
    - Milou (Snowy): White Wire Fox Terrier.
    
    Output Format (Markdown):
    **Panel 1**
    *Visual:* [Description of the scene, setting, and characters]
    *Caption:* [Narration box if needed]
    *Tintin:* [Dialogue]
    *Haddock:* [Dialogue]
    
    Make it educational but entertaining.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text || "";
};

export const generateComicIllustration = async (script: string): Promise<string | null> => {
  const ai = getAI();
  const prompt = `
    Create a comic book illustration in the style of Hergé (The Adventures of Tintin).
    
    Characters (Must match exactly):
    - Captain Haddock: Man in his 40s. Has a thick black beard. Wears a blue seaman sweater (with anchor), black jacket, black pants, and always a black captain's hat.
    - Tintin: 30 years old man with a youthful look (not a teenager). Signature orange-blond quiff hairstyle, blue sweater, white collar, brown pants.
    - Milou (Snowy): White Wire Fox Terrier dog.

    Visualize a key scene from this script: 
    
    ${script.substring(0, 1000)}

    Style: Ligne Claire (Clear Line) art style. Flat colors, no shading, clear continuous black outlines. Detailed, realistic background. Expressive characters.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: [{ text: prompt }] },
      config: {
        // imageConfig can be added here if needed, but defaults are usually fine for this model.
        // Guidelines say do not set responseMimeType for nano banana.
      }
    });

    for (const part of response.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating illustration:", error);
    return null;
  }
};

export const generatePodcastAudio = async (
  article: Article, 
  profile: ConsumerProfile
): Promise<AudioBuffer | null> => {
  const ai = getAI();
  
  // Truncate content strictly to 2500 chars to avoid "Rpc failed" (Error 6)
  const safeContent = article.content.length > 2500 
    ? article.content.substring(0, 2500) + "..." 
    : article.content;

  const prompt = `
    Create a lively, engaging podcast conversation between two hosts (Joe and Jane) discussing this article.
    Target Audience: ${profile.role}, ${profile.expertise}.
    
    Article Title: ${article.title}
    Article Content: 
    """
    ${safeContent}
    """
    
    Make it sound natural, with back-and-forth dialogue, analyzing the key points.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: [
                    {
                        speaker: 'Joe',
                        voiceConfig: {
                          prebuiltVoiceConfig: { voiceName: 'Kore' }
                        }
                    },
                    {
                        speaker: 'Jane',
                        voiceConfig: {
                          prebuiltVoiceConfig: { voiceName: 'Puck' }
                        }
                    }
              ]
            }
        }
      }
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) return null;

    const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
    const audioBuffer = await decodeAudioData(
      base64ToUint8Array(base64Audio),
      outputAudioContext,
      24000,
      1
    );
    return audioBuffer;

  } catch (error) {
    console.error("Error generating podcast:", error);
    throw error; // Re-throw to handle in UI
  }
};