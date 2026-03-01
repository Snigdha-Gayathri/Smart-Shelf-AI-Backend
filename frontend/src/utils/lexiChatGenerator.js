/**
 * lexi Chat - A sharp, sarcastic, Gen-Z book buddy
 * Generates contextual responses based on user's reading history
 * 
 * CRITICAL: Always responds to the MOST RECENT user message
 * Never repeats, never falls back to personality summaries mid-chat
 */

// Track last response to prevent duplicates
let lastGeneratedResponse = '';

/**
 * Character database - common book characters and their roasts
 */
const CHARACTER_DATABASE = {
  // Rina Kent characters
  'landon': {
    fullName: 'Landon King',
    book: 'God of Ruin',
    roast: "Landon King? Oh you didn't just read him — you folded. Control issues, dominance, emotional manipulation wrapped in 'I'd burn the world for you' energy. Your bookshelf is screaming and you're pretending not to hear it.",
  },
  'eli': {
    fullName: 'Eli King',
    book: 'God of Malice',
    roast: "Eli King... the quiet, unhinged one. So you like the 'I'll watch you from the shadows' type? Noted. Your taste in men is concerning but also... I get it.",
  },
  'killian': {
    fullName: 'Killian Carson',
    book: 'God of Wrath',
    roast: "Killian Carson? Anger issues personified but make it hot. You read that and thought 'yes, this is fine.' Bestie, your standards are in the basement but at least you're aware.",
  },
  'creighton': {
    fullName: 'Creighton King',
    book: 'God of Pain',
    roast: "Creighton? The golden boy with darkness underneath? Classic. You like your trauma wrapped in a pretty package.",
  },
  'nikolai': {
    fullName: 'Nikolai Sokolov',
    book: 'God of Fury',
    roast: "Nikolai Sokolov. The chaos agent. You read that and felt things. I'm judging you. But also same.",
  },
  
  // Ana Huang characters
  'rhys': {
    fullName: 'Rhys Larsen',
    book: 'Twisted Hate',
    roast: "Rhys Larsen? The enemies-to-lovers poster boy. You ate that up. The bickering? The tension? You were LIVING for it.",
  },
  'alex': {
    fullName: 'Alex Volkov',
    book: 'Twisted Love',
    roast: "Alex Volkov. Cold, calculated, emotionally unavailable until she thaws him. That trope has you in a chokehold and you know it.",
  },
  'josh': {
    fullName: 'Josh Chen',
    book: 'Twisted Games',
    roast: "Josh Chen? The golden retriever bodyguard? Finally, some taste. He's the only stable one in that series.",
  },
  'christian': {
    fullName: 'Christian Harper',
    book: 'Twisted Lies',
    roast: "Christian Harper... manipulative, rich, obsessed. You love a man with too much power and not enough therapy.",
  },
  
  // Penelope Douglas
  'damon': {
    fullName: 'Damon Torrance',
    book: 'Kill Switch',
    roast: "Damon Torrance? Oh we need to TALK. That's not a red flag, that's the whole Soviet Union. But you read it twice, didn't you?",
  },
  'kai': {
    fullName: 'Kai Mori',
    book: 'Corrupt',
    roast: "Kai Mori. The quiet, deadly one. Minimal words, maximum chaos. You're attracted to emotional unavailability. That tracks.",
  },
  'michael': {
    fullName: 'Michael Crist',
    book: 'Corrupt',
    roast: "Michael Crist. Leader energy with zero self-control. You read Corrupt and became a different person, didn't you?",
  },
  
  // Sarah J. Maas
  'rhysand': {
    fullName: 'Rhysand',
    book: 'A Court of Thorns and Roses',
    roast: "Rhysand? The High Lord of the Night Court and your standards. He ruined book boyfriends for you forever and you're not even mad.",
  },
  'cassian': {
    fullName: 'Cassian',
    book: 'A Court of Wings and Ruin',
    roast: "Cassian. The Illyrian warrior with commitment issues. You love a man who'd fight an army for you but can't say 'I love you' first.",
  },
  'azriel': {
    fullName: 'Azriel',
    book: 'ACOTAR series',
    roast: "Azriel. The shadowsinger. Silent, tortured, mysterious. You're attracted to men who need intensive therapy. But who isn't?",
  },
  'rowan': {
    fullName: 'Rowan Whitethorn',
    book: 'Throne of Glass',
    roast: "Rowan Whitethorn? Grumpy, immortal, ridiculously powerful. You love a slow burn that takes 3 books. Patience you've never applied to real life.",
  },
  
  // Colleen Hoover
  'atlas': {
    fullName: 'Atlas Corrigan',
    book: 'It Ends With Us',
    roast: "Atlas Corrigan. The one that got away who comes back. You're a sucker for second-chance romance and I respect that.",
  },
  'ryle': {
    fullName: 'Ryle Kincaid',
    book: 'It Ends With Us',
    roast: "Ryle... if you liked Ryle, we need to have a different conversation. Please tell me you didn't.",
  },
  
  // General dark romance
  'morally grey': {
    fullName: 'Morally Grey Characters',
    book: 'Various',
    roast: "So you have a 'morally grey' obsession. That's just 'he's toxic but hot' with better marketing. Your therapist would have thoughts.",
  },
  
  // Twisted series specific
  'twisted': {
    fullName: 'Twisted Series',
    book: 'Ana Huang',
    roast: "The Twisted series? So you've been through all four of them? Which toxic man was your favorite? Don't lie.",
  },
};

/**
 * Generate lexi's welcome message on first chat
 */
export function generateWelcomeMessage(previousReads, currentlyReading) {
  const totalBooks = previousReads.length || 0;
  
  if (totalBooks === 0) {
    return "Hey! I'm Q Lexi. So... your reading history is empty. That's giving 'I'll read more in 2026' energy. Tell me what you're into and let's fix that together.";
  }

  if (totalBooks === 1) {
    const book = previousReads[0];
    return "Hey! I'm Q Lexi. I see you finished \"" + book.title + "\". Bold first read. Let's talk about your taste (or lack thereof). What's on your mind?";
  }

  const genres = {};
  previousReads.forEach(book => {
    if (book.genre) {
      genres[book.genre] = (genres[book.genre] || 0) + 1;
    }
  });

  const topGenre = Object.entries(genres).sort((a, b) => b[1] - a[1])[0]?.[0];
  const topGenreCount = genres[topGenre] || 0;
  const isGenreObsessed = topGenreCount / totalBooks >= 0.6;

  if (isGenreObsessed) {
    return "Hey! I'm Q Lexi. I've seen your reading history. " + topGenreCount + " out of " + totalBooks + " books are " + topGenre + "? That's not a preference, that's a personality. Ask me anything.";
  }

  return "Hey! I'm Q Lexi. I've been watching your reading journey and it's... chaotic. In the best way. What's on your mind today?";
}

/**
 * Get dynamic subtitle based on reading patterns
 */
export function getDynamicSubtitle(previousReads) {
  const subtitles = [
    "Your slightly judgmental reading buddy",
    "Here to hype your book taste (or roast it)",
    "I've seen your reading history. We need to talk.",
    "Your book therapist",
    "Enabling your book addiction since today",
  ];

  if (!previousReads || previousReads.length === 0) {
    return "Let's find you some books";
  }

  const likedCount = previousReads.filter(b => b.liked === true).length;
  const dislikedCount = previousReads.filter(b => b.liked === false).length;

  if (dislikedCount > likedCount) {
    return "Why do you hate so much? Let's fix that.";
  }

  if (previousReads.length > 0 && likedCount / previousReads.length > 0.9) {
    return "Okay, you actually have taste? Interesting...";
  }

  return subtitles[Math.floor(Math.random() * subtitles.length)];
}

/**
 * Find if user mentioned a character from the database
 */
function findMentionedCharacter(userMessage) {
  const messageLower = userMessage.toLowerCase();
  
  for (const [key, data] of Object.entries(CHARACTER_DATABASE)) {
    if (messageLower.includes(key)) {
      return data;
    }
  }
  
  return null;
}

/**
 * Find if user mentioned a specific book from their reading history
 */
function findMentionedBook(userMessage, previousReads) {
  if (!previousReads || previousReads.length === 0) return null;
  
  const messageLower = userMessage.toLowerCase();
  
  for (const book of previousReads) {
    const titleLower = book.title.toLowerCase();
    // Check for exact title or significant parts of the title (words > 4 chars)
    if (messageLower.includes(titleLower) || 
        titleLower.split(' ').filter(word => word.length > 4).some(word => messageLower.includes(word))) {
      return book;
    }
  }
  
  return null;
}

/**
 * Generate response specific to a book the user mentioned
 */
function generateBookSpecificResponse(book, userMessage) {
  const messageLower = userMessage.toLowerCase();
  const title = book.title;
  const genre = book.genre || 'book';
  const liked = book.liked;
  
  // User asking what Lexi thinks about the book
  if (messageLower.match(/\b(think about|opinion on|thoughts on|what do you think)\b/)) {
    if (liked === true) {
      return "\"" + title + "\"? Yeah, that tracks. You loved it and honestly, I can see why. It's peak " + genre + " energy. The kind of book that changes your personality just a little. Did it?";
    } else if (liked === false) {
      return "\"" + title + "\"... so you read it and hated it. That's bold. What went wrong? Was it the pacing, the characters, or did it just not match your vibe?";
    }
    return "\"" + title + "\"? You read that. " + genre + ", right? What made you pick it up in the first place?";
  }
  
  // User talking about finishing/reading the book
  if (messageLower.match(/\b(finished|read|completed|done with)\b/)) {
    if (liked === true) {
      return "You finished \"" + title + "\" and loved it. Of course you did. Now you're probably in that post-book depression where nothing else will hit the same for a while. Am I right?";
    } else if (liked === false) {
      return "So you powered through \"" + title + "\" even though it wasn't it? That's commitment or stubbornness. Which one was it?";
    }
    return "\"" + title + "\" done and dusted. How are you feeling about it? Worth the time or nah?";
  }
  
  // Default book-specific response
  const reactions = [
    "Oh \"" + title + "\"? I see that in your history. " + genre + " " + (liked === true ? "that you loved" : liked === false ? "that disappointed you" : "that you experienced") + ". What about it are you thinking about?",
    "\"" + title + "\"... yeah, I remember you reading that. What's coming up for you about it?",
    "Talking about \"" + title + "\"? I have thoughts. But first - what's YOUR take now that you've sat with it?",
  ];
  return reactions[Math.floor(Math.random() * reactions.length)];
}

/**
 * Ensure response is unique and not a repeat
 */
function ensureUniqueResponse(response, previousResponses) {
  previousResponses = previousResponses || [];
  
  // If this exact response was just given, generate variation
  if (response === lastGeneratedResponse || previousResponses.includes(response)) {
    const variations = [
      response + " But seriously, what's on your mind?",
      response.replace(/\?$/, "? Tell me more."),
      "Wait, I feel like we just talked about this. What else you got?",
    ];
    const newResponse = variations[Math.floor(Math.random() * variations.length)];
    lastGeneratedResponse = newResponse;
    return newResponse;
  }
  
  lastGeneratedResponse = response;
  return response;
}

/**
 * Generate lexi's response based on user input and context
 * CRITICAL: Always responds to the MOST RECENT user message
 */
export function generateLexiResponse(userMessage, previousReads, currentlyReading, messageHistory) {
  messageHistory = messageHistory || [];
  const messageLower = userMessage.toLowerCase().trim();
  
  // Guard: Empty message
  if (!messageLower) {
    return "You just sent me nothing? I need WORDS to work with here.";
  }
  
  // Get previous lexi responses to avoid duplicates
  const previousLexiResponses = Array.isArray(messageHistory) 
    ? messageHistory.filter(function(m) { return m.sender === 'lexi'; }).map(function(m) { return m.text; })
    : [];
  
  // Context data
  const totalBooks = previousReads?.length || 0;
  const genres = {};
  
  if (previousReads && previousReads.length > 0) {
    previousReads.forEach(function(book) {
      if (book.genre) {
        genres[book.genre] = (genres[book.genre] || 0) + 1;
      }
    });
  }

  const topGenreEntry = Object.entries(genres).sort(function(a, b) { return b[1] - a[1]; })[0];
  const topGenre = topGenreEntry ? topGenreEntry[0] : null;
  const recentBooks = previousReads?.slice(-3) || [];
  
  // ===========================================
  // PRIORITY 1: CHARACTER DETECTION (most specific)
  // ===========================================
  const mentionedCharacter = findMentionedCharacter(userMessage);
  if (mentionedCharacter) {
    return ensureUniqueResponse(mentionedCharacter.roast, previousLexiResponses);
  }
  
  // ===========================================
  // PRIORITY 2: BOOK FROM HISTORY
  // ===========================================
  const mentionedBook = findMentionedBook(userMessage, previousReads);
  if (mentionedBook) {
    return ensureUniqueResponse(generateBookSpecificResponse(mentionedBook, userMessage), previousLexiResponses);
  }
  
  // ===========================================
  // PRIORITY 3: SPECIFIC INTENTS
  // ===========================================
  
  // Greeting / Hi
  if (messageLower.match(/^(hi|hey|hello|sup|yo|what's up|heyyy+)[\s!?.]*$/i)) {
    const greetings = [
      "Hey! What's on your reading radar today?",
      "Sup! Got a book question or are we just vibing?",
      "Hey! What are we talking about - books, characters, your questionable taste?",
    ];
    return ensureUniqueResponse(greetings[Math.floor(Math.random() * greetings.length)], previousLexiResponses);
  }
  
  // Thanks / Appreciation
  if (messageLower.match(/\b(thank|thanks|thx|appreciate|helpful)\b/)) {
    const thanks = [
      "Of course! That's what I'm here for. What else you need?",
      "Anytime! Got more book questions?",
      "You're welcome! Now what else is on your mind?",
    ];
    return ensureUniqueResponse(thanks[Math.floor(Math.random() * thanks.length)], previousLexiResponses);
  }
  
  // Book recommendations
  if (messageLower.match(/\b(recommend|suggestion|next book|what should i read|book for me|give me a book|something to read)\b/)) {
    if (totalBooks === 0) {
      return ensureUniqueResponse("You want a recommendation but you haven't told me what you like yet. What vibe? Dark? Romantic? Chaotic? Give me something.", previousLexiResponses);
    }
    var topGenreText = topGenre || 'varied';
    var mixedText = topGenre || 'mixed';
    var responses = [
      "Based on your " + topGenreText + " reads - you want something similar or a palette cleanser? Because I can go either way.",
      "With " + totalBooks + " books under your belt and a " + mixedText + " obsession, what are you craving? More chaos or something different?",
      "Okay, so you want recs. Do you want me to enable your current taste or challenge it? Be honest.",
    ];
    return ensureUniqueResponse(responses[Math.floor(Math.random() * responses.length)], previousLexiResponses);
  }

  // Genre-specific questions
  var genreMatch = messageLower.match(/\b(romance|fantasy|thriller|mystery|horror|sci-fi|science fiction|dystopian|contemporary|historical|dark romance)\b/i);
  if (genreMatch) {
    var mentionedGenre = genreMatch[0];
    var genreCapitalized = mentionedGenre.charAt(0).toUpperCase() + mentionedGenre.slice(1);
    var hasReadGenre = genres[genreCapitalized] > 0;
    
    if (hasReadGenre) {
      return ensureUniqueResponse(genreCapitalized + "? You've read " + genres[genreCapitalized] + " of those. Looking for more or trying to understand your obsession? I can help with both.", previousLexiResponses);
    } else {
      var usualLane = topGenre || 'scattered';
      return ensureUniqueResponse(genreCapitalized + "? That's new for you. Your usual lane is " + usualLane + ". What made you want to branch out?", previousLexiResponses);
    }
  }

  // DNF or struggling with a book
  if (messageLower.match(/\b(dnf|didn't finish|can't finish|struggling|boring|hate this book|not finishing)\b/)) {
    if (currentlyReading && currentlyReading.length > 0) {
      var current = currentlyReading[0];
      return ensureUniqueResponse("Struggling with \"" + current.title + "\"? Real talk: are you forcing it because you think you SHOULD like it? Life's too short for books that don't hit.", previousLexiResponses);
    }
    return ensureUniqueResponse("DNFing is valid. No shame. Which book broke the contract? Tell me what went wrong.", previousLexiResponses);
  }

  // Explicitly asking for personality/roast
  if (messageLower.match(/\b(roast me|judge me|my personality|reading personality|analyze me|what does my|tell me about myself)\b/)) {
    if (totalBooks === 0) {
      return ensureUniqueResponse("You want me to analyze you? Give me some data first. What have you actually read?", previousLexiResponses);
    }
    
    if (topGenre && genres[topGenre] / totalBooks >= 0.6) {
      return ensureUniqueResponse("Your taste? It's " + topGenre + ". Like, REALLY " + topGenre + ". " + genres[topGenre] + " out of " + totalBooks + " books. You're not exploring - you're living there permanently. Own it.", previousLexiResponses);
    }
    
    var genreList = Object.keys(genres).join(', ');
    return ensureUniqueResponse("Your taste is chaotic. " + totalBooks + " books across " + genreList + ". I can't tell if you're adventurous or just indecisive. It's entertaining though.", previousLexiResponses);
  }

  // Currently reading questions
  if (messageLower.match(/\b(what am i reading|currently reading|reading right now|what.*reading)\b/)) {
    if (!currentlyReading || currentlyReading.length === 0) {
      return ensureUniqueResponse("You're not reading anything right now. That's either a break or procrastination. Which one?", previousLexiResponses);
    }
    var currentBook = currentlyReading[0];
    return ensureUniqueResponse("You're reading \"" + currentBook.title + "\". How's that going? Actually invested or just going through the motions?", previousLexiResponses);
  }

  // Mood-based requests
  if (messageLower.match(/\b(mood|feel|feeling|vibe|vibes|emotional|crying|sad|happy|depressed|anxious|angry)\b/)) {
    var emotionMatch = messageLower.match(/\b(crying|sad|angry|happy|excited|depressed|anxious|bored|lonely)\b/);
    var emotion = emotionMatch ? emotionMatch[0] : null;
    
    if (emotion === 'sad' || emotion === 'crying' || emotion === 'depressed' || emotion === 'lonely') {
      return ensureUniqueResponse("You're in your feelings. Do you want a book that matches that energy or one that pulls you out? I can do damage either way.", previousLexiResponses);
    }
    
    if (emotion === 'happy' || emotion === 'excited') {
      return ensureUniqueResponse("Happy vibes? Rare. Let's find something that keeps that energy or absolutely destroys it. Your call.", previousLexiResponses);
    }
    
    if (emotion === 'bored') {
      return ensureUniqueResponse("Bored? I can fix that. What's the wildest trope you're willing to try right now?", previousLexiResponses);
    }
    
    if (emotion === 'angry') {
      return ensureUniqueResponse("Angry reading? I get it. You want something cathartic or something to fuel the rage? Both are valid.", previousLexiResponses);
    }
    
    return ensureUniqueResponse("What's the mood specifically? 'Existential crisis' or 'mildly annoyed'? The recs change drastically.", previousLexiResponses);
  }

  // Tropes
  if (messageLower.match(/\b(trope|enemies to lovers|friends to lovers|slow burn|forced proximity|grumpy sunshine|forbidden|secret|fake dating|arranged marriage|second chance)\b/)) {
    var tropeMatch = messageLower.match(/\b(enemies to lovers|friends to lovers|slow burn|forced proximity|grumpy sunshine|forbidden|secret|fake dating|arranged marriage|second chance)\b/);
    var trope = tropeMatch ? tropeMatch[0] : null;
    
    if (trope) {
      var tropeCap = trope.charAt(0).toUpperCase() + trope.slice(1);
      return ensureUniqueResponse(tropeCap + "? Yeah, you have a type. Looking for more of that or are we expanding your horizons?", previousLexiResponses);
    }
    return ensureUniqueResponse("Tropes? I love it. Which one has you in a chokehold right now?", previousLexiResponses);
  }

  // Author questions
  if (messageLower.match(/\b(author|writer|who wrote|written by)\b/)) {
    if (recentBooks.length > 0) {
      var lastBook = recentBooks[0];
      var authorName = lastBook.author || 'an author you should remember';
      return ensureUniqueResponse("Your last read was by " + authorName + ". Want more from them or trying something new?", previousLexiResponses);
    }
    return ensureUniqueResponse("Looking for author recs? Tell me what you've liked and I'll find someone who matches that energy.", previousLexiResponses);
  }

  // Questions starting with "What do you think"
  if (messageLower.startsWith('what do you think')) {
    return ensureUniqueResponse("What do I think? About what specifically? Give me a book, a character, a trope - I'll have opinions.", previousLexiResponses);
  }

  // Questions starting with "why"
  if (messageLower.startsWith('why')) {
    if (messageLower.match(/\b(read|book|reading)\b/)) {
      return ensureUniqueResponse("Why do you read? Probably because real life isn't dramatic enough. Books let you experience chaos from a safe distance.", previousLexiResponses);
    }
    return ensureUniqueResponse("Why? That's philosophical. Be more specific and I'll give you a real answer.", previousLexiResponses);
  }

  // Help/confusion
  if (messageLower.match(/\b(help|confused|don't know|unsure|idk|not sure)\b/)) {
    return ensureUniqueResponse("You need help? With what - picking a book, finishing one, or admitting your taste is questionable? I can work with all of that.", previousLexiResponses);
  }
  
  // How are you / how's it going
  if (messageLower.match(/\b(how are you|how's it going|how you doing|what's up)\b/)) {
    return ensureUniqueResponse("I'm vibing. Reading everyone's terrible book choices and judging silently. What about you? What are you reading?", previousLexiResponses);
  }

  // Favorite book questions
  if (messageLower.match(/\b(favorite|best|loved|top)\b/) && messageLower.match(/\b(book|read)\b/)) {
    if (totalBooks === 0) {
      return ensureUniqueResponse("You're asking about favorites when your history is empty? Give me something to work with first.", previousLexiResponses);
    }
    var likedBooks = previousReads?.filter(function(b) { return b.liked === true; }) || [];
    if (likedBooks.length > 0) {
      var fav = likedBooks[0];
      return ensureUniqueResponse("Based on your ratings, you loved \"" + fav.title + "\". That one really hit, huh? What made it special?", previousLexiResponses);
    }
    return ensureUniqueResponse("I see reads but no clear favorite from your ratings. Which one actually stuck with you?", previousLexiResponses);
  }

  // Long message - ask for clarification
  if (userMessage.length > 100) {
    return ensureUniqueResponse("Okay you wrote a LOT. I respect the energy. What's the main thing you need from me here?", previousLexiResponses);
  }

  // Very short/vague message
  if (messageLower.length < 15 && !messageLower.includes('?')) {
    var clarify = [
      "\"" + userMessage + "\"? You're gonna have to give me more than that. What about it?",
      "That's... vague. Can you elaborate?",
      "I need more context here. What are we actually talking about?",
    ];
    return ensureUniqueResponse(clarify[Math.floor(Math.random() * clarify.length)], previousLexiResponses);
  }

  // Default - engage with the actual message content
  var shortMsg = userMessage.slice(0, 30);
  var defaults = [
    "Okay, \"" + userMessage + "\" - I'm not 100% sure what you're getting at but I'm intrigued. What book or vibe are we talking about?",
    "I hear you saying \"" + shortMsg + "...\" What specifically do you want to know?",
    "Interesting. Tell me more about what you mean by that.",
    "I'm listening. Can you give me a bit more context?",
  ];
  
  return ensureUniqueResponse(defaults[Math.floor(Math.random() * defaults.length)], previousLexiResponses);
}

/**
 * Analyze user message sentiment for contextual response
 */
export function analyzeMessageTone(message) {
  var lower = message.toLowerCase();
  
  if (lower.includes('!')) return 'excited';
  if (lower.includes('?')) return 'questioning';
  if (lower.match(/\b(hate|ugh|why|sigh|god)\b/)) return 'frustrated';
  if (lower.match(/\b(love|amazing|obsessed|omg)\b/)) return 'enthusiastic';
  if (lower.includes('...')) return 'contemplative';
  
  return 'neutral';
}

/**
 * Reset last response tracking (called when chat is cleared)
 */
export function resetResponseState() {
  lastGeneratedResponse = '';
}
