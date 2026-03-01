/**
 * Generate a humorous, Gen Z personality story based on reading patterns
 * Long-form, roasting, funny, and personalized
 */
export function generatePersonalityStory(previousReads) {
  if (!previousReads || previousReads.length === 0) {
    return `Okay bestie, let's address the elephant in the room—your reading history is completely empty. Like, not a single book. Nothing. Nada. Zero. 📚

This is giving major "I'll start reading next Monday" energy, and we both know how that ends. Your New Year's resolution is judging you from the corner right now.

But here's the thing: Q Lexi doesn't judge (okay, I judge a little), and I genuinely believe you're about to become a whole different person once you start reading. The question is—what KIND of person? A fantasy escapist? A romance addict? A thriller psychopath? Only one way to find out.

Go pick a book from your recommendations. ANY book. And come back so I can properly roast your taste. I'll be waiting. Impatiently. 💫`;
  }

  if (previousReads.length === 1) {
    const book = previousReads[0];
    const genre = book.genre || 'mysterious';
    return `So you've read exactly ONE book, and now you want me to write your entire personality story based on that? Bold. Very bold. I respect the audacity. 📖

That one book was "${book.title}" by ${book.author}${book.genre ? ` — a ${genre} choice` : ''}. And look, I'm not saying this one book defines your entire existence, but... it kind of does? At least for now.

${getGenreRoast(genre, 1)}

Here's the deal: you're at the beginning of your reading journey, and that's actually exciting. Every book you read from here will shape who you become. No pressure, but also... a lot of pressure. Choose wisely. Or don't. I'll roast you either way.

Come back after a few more reads and I'll have ACTUAL material to work with. Right now I'm basically writing fan fiction about your personality. 😌`;
  }

  // Analyze reading patterns deeply
  const genres = {};
  const authors = {};
  let likedCount = 0;
  let dislikedCount = 0;
  
  previousReads.forEach(book => {
    if (book.genre) {
      genres[book.genre] = (genres[book.genre] || 0) + 1;
    }
    if (book.author) {
      authors[book.author] = (authors[book.author] || 0) + 1;
    }
    if (book.liked === true) likedCount++;
    if (book.liked === false) dislikedCount++;
  });

  const totalBooks = previousReads.length;
  const sortedGenres = Object.entries(genres).sort((a, b) => b[1] - a[1]);
  const topGenre = sortedGenres[0]?.[0] || 'books';
  const topGenreCount = sortedGenres[0]?.[1] || 0;
  const secondGenre = sortedGenres[1]?.[0];
  const uniqueGenreCount = Object.keys(genres).length;
  
  const genrePercentage = Math.round((topGenreCount / totalBooks) * 100);
  const isObsessed = genrePercentage >= 50;
  const isDiverse = uniqueGenreCount >= Math.ceil(totalBooks * 0.6);
  const mostReadAuthor = Object.entries(authors).sort((a, b) => b[1] - a[1])[0];
  
  // Recent reads for context
  const recentBooks = previousReads.slice(-3);
  const recentTitles = recentBooks.map(b => `"${b.title}"`).join(', ');

  // Build the full story
  let story = '';

  // Opening - Genre analysis roast
  if (isObsessed) {
    story += `Alright, let's talk about your reading habits because honestly? They're LOUD. You've read ${totalBooks} books and ${genrePercentage}% of them are ${topGenre}. That's not a preference anymore, that's a whole lifestyle choice. Your bookshelf isn't organized by author—it's organized by "how deep into ${topGenre} am I willing to go today?" 🎯

${getGenreRoast(topGenre, topGenreCount)}

`;
  } else if (isDiverse) {
    story += `Okay so you're one of THOSE readers. The "I read everything" types. ${totalBooks} books across ${uniqueGenreCount} different genres? You're either incredibly cultured or you have commitment issues. Maybe both. Probably both. 🌈

Your recent reads include ${recentTitles} and honestly, the range is giving chaotic energy. One day you're sobbing over romance, the next you're solving mysteries, and somehow you're also fitting in a thriller? Your brain must be EXHAUSTED.

`;
  } else {
    const genreCombo = sortedGenres.slice(0, 2).map(([g, c]) => g).join(' and ');
    story += `So you've finished ${totalBooks} books, and your taste is giving "${genreCombo}" energy. Like, you clearly have preferences, but you're not completely locked in. You're keeping your options open. Playing the field. Very smart. Very strategic. 📚

Your recent reads were ${recentTitles}, and I see what you're doing there. You're trying to find yourself through books. That's either very enlightened or very concerning. I'll let you decide which.

`;
  }

  // Middle - Rating behavior analysis
  if (likedCount > 0 || dislikedCount > 0) {
    const likeRatio = likedCount / totalBooks;
    
    if (likeRatio >= 0.9 && likedCount > 2) {
      story += `Now let's talk about your ratings. You've liked ${likedCount} out of ${totalBooks} books. That's... suspicious. Either you have incredible taste and only pick bangers, or you're one of those people who gives 5 stars to everything because you "appreciate the author's effort." Which one is it? 🤔

Either way, your positivity is almost concerning. Do you even HAVE a bad book experience? Or are you just built different?

`;
    } else if (dislikedCount / totalBooks >= 0.4) {
      story += `Your rating history is... spicy. You've disliked ${dislikedCount} out of ${totalBooks} books. That's like, almost half. You're picky, critical, and honestly? I respect it. You're not out here pretending mid books are masterpieces just to seem cultured. 🔥

You know what you want, and more importantly, you know what you DON'T want. That kind of self-awareness takes years of therapy or just... reading a lot of bad books. Guess which route you took.

`;
    } else {
      story += `Your ratings are pretty balanced—some loves, some "meh," a few disappointments. That's the sign of an honest reader. You're not trying to impress anyone with your opinions. You just... have them. Loudly. To yourself. And apparently to me now. 📖

The fact that you can admit when a book didn't work for you? That's growth. Or stubbornness. Same thing, really.

`;
    }
  }

  // Author loyalty check
  if (mostReadAuthor && mostReadAuthor[1] >= 2) {
    story += `Also, I noticed you've read ${mostReadAuthor[1]} books by ${mostReadAuthor[0]}. So you found an author and decided "this is my person now." I get it. Once you vibe with someone's writing, you're locked in. It's basically a parasocial relationship but make it literary. 💕

`;
  }

  // Personality prediction with heavy roasting
  story += buildPersonalityAnalysis(genres, topGenre, totalBooks, likedCount);

  // Closing - Future prediction
  if (totalBooks < 5) {
    story += `

You're still early in your reading journey, but I can already tell you're going to be trouble. In the best way. Come back after a few more books and we'll have a REAL conversation about your personality. Right now I'm just warming up. 🚀`;
  } else if (totalBooks < 15) {
    story += `

You're getting there. Your reading personality is forming, and honestly? It's interesting. A little chaotic, a little predictable, but definitely interesting. Keep going—I want to see where this story ends up. Or doesn't end. Because readers never really stop. That's the addiction talking. 📈`;
  } else {
    story += `

At this point, you're not just a reader—you're a whole character. Your book choices have shaped you in ways you probably don't even realize. And honestly? I think that's beautiful. Weird, but beautiful. Keep being you, you absolute bookworm. 💫`;
  }

  return story;
}

/**
 * Get genre-specific roasting content
 */
function getGenreRoast(genre, count) {
  const roasts = {
    'Romance': `${count} romance books? So you're just out here believing in love despite ALL the evidence life has given you? That's not reading, that's ✨manifesting✨. You probably highlight passages and send them to people who hurt you. Bold move.`,
    
    'Fantasy': `${count} fantasy books means you've basically checked out of reality. Not judging (okay, judging a little), but you're definitely the type who has strong opinions about magic systems and gets HEATED about world-building. Your real life could never.`,
    
    'Mystery': `${count} mysteries? You're either a detective in training or you just really love feeling smarter than fictional characters. Either way, you probably guess the ending at chapter 3 and still act shocked when you're right.`,
    
    'Thriller': `${count} thrillers. You like your heart rate elevated and your trust issues validated. Every book is just confirming what you already knew: trust no one, assume everyone has a secret, and always check the basement.`,
    
    'Sci-Fi': `${count} sci-fi books? So you're already living in 2087 mentally while the rest of us are stuck here. You probably have OPINIONS about AI ethics and space colonization. Please don't bring up the Fermi paradox at parties.`,
    
    'Horror': `${count} horror reads. You ENJOY being scared? For fun? On PURPOSE? That's a choice. A concerning choice. You're either extremely brave or you've already accepted your fate. Either way, respect.`,
    
    'Self-Help': `${count} self-help books. So you're actively trying to become a better person through reading? That's either really inspiring or you're just procrastinating actual change by reading ABOUT change. Only you know the truth.`,
    
    'Literary Fiction': `${count} literary fiction books. You like things DEEP. Meaningful. Probably depressing. You're the person at parties who starts sentences with "I was reading this book about the human condition..." and everyone suddenly needs a refill.`,
    
    'Historical Fiction': `${count} historical fiction reads. You like the past, but make it dramatic. You probably know way too much about specific time periods and correct people's historical accuracy. Fun at parties, terrifying in debate.`,
    
    'Dystopian': `${count} dystopian novels? So you're either preparing for the inevitable collapse of society or you just find comfort in fictional worlds worse than ours. Both valid. Concerning, but valid.`,
  };

  return roasts[genre] || `You've read ${count} ${genre} books, and at this point, that genre has become your entire personality. Own it.`;
}

/**
 * Build personality analysis based on genre mix
 */
function buildPersonalityAnalysis(genres, topGenre, totalBooks, likedCount) {
  const traits = [];
  
  if (genres['Romance'] >= 2) traits.push("hopeless romantic who believes in happily-ever-afters");
  if (genres['Fantasy'] >= 2) traits.push("professional reality avoider");
  if (genres['Mystery'] >= 2) traits.push("amateur detective with trust issues");
  if (genres['Thriller'] >= 2) traits.push("adrenaline addict");
  if (genres['Sci-Fi'] >= 2) traits.push("futurist with opinions");
  if (genres['Horror'] >= 2) traits.push("chaos enthusiast");
  if (genres['Self-Help'] >= 2) traits.push("actively becoming your best self (allegedly)");
  if (genres['Literary Fiction'] >= 2) traits.push("overthinker with feelings");
  if (genres['Dystopian'] >= 2) traits.push("pessimistic optimist");
  
  if (traits.length === 0) {
    return `Based on your reading history, your personality is: COMPLICATED. In a good way. You don't fit in a box, and honestly, that's the most interesting thing about you.`;
  }
  
  if (traits.length === 1) {
    return `Based on all of this? Your reader personality is: ${traits[0]}. That's it. That's the diagnosis. No further questions. 🎭`;
  }
  
  const traitList = traits.slice(0, -1).join(", ") + " and " + traits[traits.length - 1];
  return `So what's your reader personality? You're basically a ${traitList}. That's a lot of layers. You contain multitudes. Or contradictions. Same thing. 🎭`;
}
