export interface LanguageMapping {
    displayName: string;
    googleCode: string;
    whisperCode: string;
    appleCode: string;
  }  

  export const LANGUAGE_MAP: Record<string, LanguageMapping> = {
    'English': { displayName: 'English', googleCode: 'en', whisperCode: 'en', appleCode: 'en_US' },
    'French': { displayName: 'French', googleCode: 'fr', whisperCode: 'fr', appleCode: 'fr_FR' },
    'Spanish': { displayName: 'Spanish', googleCode: 'es', whisperCode: 'es', appleCode: 'es_ES' },
    'Italian': { displayName: 'Italian', googleCode: 'it', whisperCode: 'it', appleCode: 'it_IT' },
    'Portuguese': { displayName: 'Portuguese', googleCode: 'pt', whisperCode: 'pt', appleCode: 'pt_BR' },
    'German': { displayName: 'German', googleCode: 'de', whisperCode: 'de', appleCode: 'de_DE' },
    'Japanese': { displayName: 'Japanese', googleCode: 'ja', whisperCode: 'ja', appleCode: 'ja_JP' },
    'Chinese': { displayName: 'Chinese', googleCode: 'zh-CN', whisperCode: 'zh', appleCode: 'zh_CN' }
  };

export const getLanguageCode = (language: string): LanguageMapping => {
    const languageMapping = LANGUAGE_MAP[language];
    return languageMapping;
  };


export const getAppleCodeFromGoogleCode = (googleCode: string): string => {
    for (const lang of Object.values(LANGUAGE_MAP)) {
      if (lang.googleCode === googleCode) {
        return lang.appleCode;
      }
    }
    // Default to English if not found
    console.warn(`No Apple language code found for Google code: ${googleCode}`);
    return 'en_US';
  }
  
