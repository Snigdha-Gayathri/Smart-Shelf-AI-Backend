import React, { useState, useEffect, useRef } from 'react';
import { FaMicrophone, FaMicrophoneSlash } from 'react-icons/fa';

export default function BookPromptInput({ onSubmit }) {
  const [prompt, setPrompt] = useState('');
  const [listening, setListening] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const recognitionRef = useRef(null);
  // ISSUE 2 FIX: Track final transcript separately to avoid repetition of interim results
  const finalTranscriptRef = useRef('');

  // Initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      // ISSUE 2 FIX: Enable continuous mode to capture full sentences without premature cutoff
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      // ISSUE 2 FIX: Set maxAlternatives for better accuracy
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setListening(true);
        finalTranscriptRef.current = ''; // Reset on new session
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';

        // ISSUE 2 FIX: Only process new results from current event, not accumulate all
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript.trim();
          if (event.results[i].isFinal) {
            // ISSUE 2 FIX: Commit only final transcripts, avoid repeating interim text
            if (transcript && transcript !== finalTranscriptRef.current) {
              finalTranscriptRef.current = transcript;
              setPrompt(prev => {
                const newPrompt = prev.trim();
                return newPrompt ? newPrompt + ' ' + transcript : transcript;
              });
            }
          } else {
            interimTranscript += transcript + ' ';
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setListening(false);
        
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please enable microphone permissions.');
        } else if (event.error === 'no-speech') {
          // Silent failure for no speech detected
        } else {
          alert('Speech recognition error: ' + event.error);
        }
      };

      recognition.onend = () => {
        setListening(false);
      };

      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
      console.warn('Speech recognition not supported in this browser');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  function handleVoice() {
    if (!speechSupported) {
      alert('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
      return;
    }

    if (listening) {
      // Stop listening
      recognitionRef.current?.stop();
      setListening(false);
    } else {
      // Start listening
      try {
        recognitionRef.current?.start();
      } catch (error) {
        console.error('Error starting speech recognition:', error);
        alert('Could not start speech recognition. Please try again.');
      }
    }
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(prompt);
    }
  }

  return (
    <form className="flex flex-col items-center gap-4 sm:gap-6 py-6 sm:py-8 md:py-10 px-4 w-full" onSubmit={handleSubmit}>
      <label htmlFor="bookPrompt" className="text-xl sm:text-2xl md:text-3xl font-semibold text-cool-blue dark:text-cool-blue text-center">
        What would you like to read today?
      </label>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full max-w-3xl">
        <input
          id="bookPrompt"
          type="text"
          className="flex-1 px-4 sm:px-6 py-3 sm:py-4 rounded-xl border border-white/30 dark:border-white/10 bg-white/50 dark:bg-slate-800/40 backdrop-blur-lg text-sm sm:text-base md:text-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-cool-blue focus:border-transparent"
          placeholder="Jovial and funny read"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
        />
        <div className="flex gap-2 sm:gap-3">
          <button 
            type="button" 
            className={`p-3 sm:p-4 rounded-lg sm:rounded-full shadow-md transition flex-shrink-0 min-h-11 min-w-11 sm:min-h-auto sm:min-w-auto ${
              listening 
                ? 'bg-red-500 text-white animate-pulse' 
                : speechSupported
                  ? 'bg-cool-accent text-white hover:bg-cool-blue'
                  : 'bg-slate-400 text-slate-600 cursor-not-allowed'
            }`}
            onClick={handleVoice}
            disabled={!speechSupported}
            aria-label={listening ? 'Stop listening' : 'Start voice input'}
            title={!speechSupported ? 'Speech recognition not supported' : ''}
          >
            {listening ? <FaMicrophone size={20} /> : <FaMicrophone size={20} />}
          </button>
          <button 
            type="submit" 
            className="flex-1 sm:flex-none px-6 sm:px-8 py-3 sm:py-4 rounded-lg sm:rounded-xl bg-cool-blue text-white font-semibold shadow-md hover:bg-cool-accent transition text-sm sm:text-base"
          >
            Recommend
          </button>
        </div>
      </div>
      {listening && (
        <p className="text-xs sm:text-sm text-cool-accent dark:text-cool-accent animate-pulse">
          🎤 Listening...
        </p>
      )}
    </form>
  );
}
