export interface LanguageMapping {
    displayName: string;
    googleCode: string;
    whisperCode: string;
  }  


export const LANGUAGE_MAP: Record<string, LanguageMapping> = {
    'English': { displayName: 'English', googleCode: 'en', whisperCode: 'en' },
    'French': { displayName: 'French', googleCode: 'fr', whisperCode: 'fr' },
    'Spanish': { displayName: 'Spanish', googleCode: 'es', whisperCode: 'es' },
    'Italian': { displayName: 'Italian', googleCode: 'it', whisperCode: 'it' },
    'Portugese': { displayName: 'Portuguese', googleCode: 'pt', whisperCode: 'pt' },
    'German': { displayName: 'German', googleCode: 'de', whisperCode: 'de' },
    'Japanese': { displayName: 'Japanese', googleCode: 'ja', whisperCode: 'ja' },
    'Chinese': { displayName: 'Chinese', googleCode: 'zh-CN', whisperCode: 'zh' }
  };

export const getLanguageCode = (language: string): LanguageMapping => {
    const languageMapping = LANGUAGE_MAP[language];
    return languageMapping;
  };
  
  
