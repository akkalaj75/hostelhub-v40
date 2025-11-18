/**
 * AI-powered features for HostelHub
 */

/**
 * 50 Fun AI Icebreakers
 */
export const icebreakers = [
  "If you could have dinner with anyone from history, who would it be?",
  "What's the most adventurous thing you've ever done?",
  "If you could learn any skill instantly, what would it be?",
  "What's your favorite way to spend a weekend?",
  "If you could travel anywhere right now, where would you go?",
  "What's the best concert or live event you've been to?",
  "If you could have any superpower, what would it be?",
  "What's the most interesting class you've taken in college?",
  "What's your go-to karaoke song?",
  "If you could swap lives with anyone for a day, who would it be?",
  "What's the weirdest food combination you actually enjoy?",
  "If you could master any musical instrument, which one?",
  "What's your favorite childhood memory?",
  "If you could live in any decade, which would you choose?",
  "What's the best book you've read recently?",
  "If you could have dinner with any fictional character, who?",
  "What's your hidden talent?",
  "If you could speak any language fluently, which one?",
  "What's the best advice you've ever received?",
  "If you could start any business, what would it be?",
  "What's your favorite pizza topping?",
  "If you could relive any moment in your life, which one?",
  "What's the most spontaneous thing you've done?",
  "If you could have any pet, real or mythical, what would it be?",
  "What's your biggest fear?",
  "If you could change one thing about the world, what would it be?",
  "What's your favorite movie quote?",
  "If you could be famous for something, what would it be?",
  "What's the most beautiful place you've ever been?",
  "If you could have tea with any celebrity, who would it be?",
  "What's your guilty pleasure TV show?",
  "If you could time travel, past or future?",
  "What's the best piece of advice you'd give your younger self?",
  "If you could only eat one cuisine for the rest of your life?",
  "What's your morning routine like?",
  "If you could solve one world problem, which one?",
  "What's your favorite season and why?",
  "If you could have any job for a day, what would it be?",
  "What's the last thing that made you laugh really hard?",
  "If you could design your dream house, what would it look like?",
  "What's your favorite way to relax after a stressful day?",
  "If you could witness any historical event, which one?",
  "What's the most interesting documentary you've seen?",
  "If you could be an expert in any field, which one?",
  "What's your favorite late-night snack?",
  "If you could have a conversation with your future self, what would you ask?",
  "What's the best gift you've ever received?",
  "If you could learn the truth about any conspiracy theory, which one?",
  "What's your biggest pet peeve?",
  "If you could have an unlimited supply of one thing, what would it be?"
];

/**
 * Get random icebreaker
 */
export function getRandomIcebreaker() {
  return icebreakers[Math.floor(Math.random() * icebreakers.length)];
}

/**
 * Get multiple unique icebreakers
 */
export function getMultipleIcebreakers(count = 3) {
  const shuffled = [...icebreakers].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Mood detection from chat messages
 */
export function detectMood(messages) {
  if (!messages || messages.length === 0) {
    return { mood: 'neutral', confidence: 0 };
  }

  const recentMessages = messages.slice(-10).join(' ').toLowerCase();
  
  const moodPatterns = {
    happy: {
      keywords: ['haha', 'lol', 'happy', 'great', 'awesome', 'love', 'excited', '😊', '😂', '❤️'],
      weight: 1
    },
    sad: {
      keywords: ['sad', 'sorry', 'down', 'depressed', 'lonely', 'miss', '😢', '😞'],
      weight: 1
    },
    angry: {
      keywords: ['angry', 'mad', 'annoyed', 'frustrated', 'hate', 'wtf', '😠', '😡'],
      weight: 1.5
    },
    excited: {
      keywords: ['!', 'amazing', 'incredible', 'omg', 'wow', 'yay', '🎉', '🔥'],
      weight: 1
    },
    bored: {
      keywords: ['bored', 'boring', 'meh', 'whatever', 'idk', 'idc'],
      weight: 0.8
    }
  };

  let scores = {};
  
  for (const [mood, data] of Object.entries(moodPatterns)) {
    let score = 0;
    data.keywords.forEach(keyword => {
      const matches = (recentMessages.match(new RegExp(keyword, 'g')) || []).length;
      score += matches * data.weight;
    });
    scores[mood] = score;
  }

  const maxScore = Math.max(...Object.values(scores));
  const dominantMood = Object.keys(scores).find(mood => scores[mood] === maxScore);
  
  return {
    mood: maxScore > 0 ? dominantMood : 'neutral',
    confidence: Math.min(maxScore / 5, 1),
    allScores: scores
  };
}

/**
 * Smart interest-based matching score
 */
export function calculateInterestMatchScore(interests1, interests2) {
  if (!interests1?.length || !interests2?.length) {
    return 0;
  }

  const set1 = new Set(interests1.map(i => i.toLowerCase()));
  const set2 = new Set(interests2.map(i => i.toLowerCase()));
  
  // Direct matches
  let commonCount = 0;
  set1.forEach(interest => {
    if (set2.has(interest)) commonCount++;
  });
  
  // Semantic similarity (simple keyword matching)
  const similarityMap = {
    'coding': ['programming', 'development', 'tech'],
    'music': ['singing', 'guitar', 'piano', 'drums'],
    'sports': ['football', 'cricket', 'basketball', 'gym'],
    'reading': ['books', 'novels', 'literature'],
    'gaming': ['games', 'esports', 'xbox', 'playstation'],
    'art': ['drawing', 'painting', 'design'],
    'travel': ['traveling', 'adventure', 'exploration'],
    'food': ['cooking', 'baking', 'foodie']
  };
  
  let semanticScore = 0;
  
  for (const [key, synonyms] of Object.entries(similarityMap)) {
    const has1 = set1.has(key) || synonyms.some(s => set1.has(s));
    const has2 = set2.has(key) || synonyms.some(s => set2.has(s));
    
    if (has1 && has2) {
      semanticScore += 0.5;
    }
  }
  
  const directScore = commonCount / Math.max(set1.size, set2.size);
  const totalScore = (directScore * 0.7) + (semanticScore * 0.3);
  
  return Math.min(totalScore, 1);
}

/**
 * Conversation engagement score
 */
export function calculateEngagementScore(messages) {
  if (!messages || messages.length < 2) {
    return 0;
  }

  let score = 0;
  
  // Message frequency
  const messageRate = messages.length / 10; // Normalize to 10 messages
  score += Math.min(messageRate * 0.3, 0.3);
  
  // Response time (if timestamps available)
  // Average message length
  const avgLength = messages.reduce((sum, msg) => sum + msg.length, 0) / messages.length;
  if (avgLength > 20) score += 0.2;
  if (avgLength > 50) score += 0.1;
  
  // Question asking (shows interest)
  const questionCount = messages.filter(msg => msg.includes('?')).length;
  score += Math.min(questionCount * 0.1, 0.2);
  
  // Emoji usage (shows emotion)
  const emojiCount = messages.filter(msg => /[\u{1F300}-\u{1F9FF}]/u.test(msg)).length;
  score += Math.min(emojiCount * 0.05, 0.2);
  
  return Math.min(score, 1);
}

/**
 * Generate conversation starters based on shared interests
 */
export function generateConversationStarters(userInterests, strangerInterests) {
  const commonInterests = userInterests.filter(i => 
    strangerInterests.map(s => s.toLowerCase()).includes(i.toLowerCase())
  );

  if (commonInterests.length === 0) {
    return getMultipleIcebreakers(3);
  }

  const starters = {
    'coding': [
      "What programming languages do you know?",
      "Working on any cool projects?",
      "Frontend or backend?"
    ],
    'music': [
      "What's your favorite artist right now?",
      "Do you play any instruments?",
      "Last concert you attended?"
    ],
    'sports': [
      "What sports do you play or follow?",
      "Favorite team?",
      "Been to any games recently?"
    ],
    'gaming': [
      "What games are you playing now?",
      "PC or console?",
      "Favorite game of all time?"
    ],
    'movies': [
      "What's the last movie you watched?",
      "Favorite movie genre?",
      "Any movie recommendations?"
    ],
    'travel': [
      "Where was your last trip?",
      "Dream destination?",
      "Best travel experience?"
    ],
    'food': [
      "What's your favorite cuisine?",
      "Can you cook?",
      "Best restaurant in town?"
    ]
  };

  const suggestions = [];
  
  commonInterests.slice(0, 2).forEach(interest => {
    const key = interest.toLowerCase();
    if (starters[key]) {
      suggestions.push(...starters[key]);
    }
  });

  if (suggestions.length === 0) {
    suggestions.push(`I see we both like ${commonInterests[0]}! Tell me more about that.`);
  }

  return suggestions.slice(0, 3);
}

/**
 * Auto-ban scoring system
 */
export function calculateUserRiskScore(reportCount, accountAge, messagesSent, violations) {
  let risk = 0;
  
  // Report count (highest weight)
  if (reportCount >= 5) risk += 0.5;
  else if (reportCount >= 3) risk += 0.3;
  else if (reportCount >= 1) risk += 0.1;
  
  // Account age (new accounts more risky)
  const daysOld = accountAge / (1000 * 60 * 60 * 24);
  if (daysOld < 1) risk += 0.2;
  else if (daysOld < 7) risk += 0.1;
  
  // Message pattern
  if (messagesSent > 100 && reportCount > 0) {
    risk += 0.1; // High activity with reports
  }
  
  // Violations
  if (violations?.contactSharing) risk += 0.3;
  if (violations?.harassment) risk += 0.4;
  if (violations?.spam) risk += 0.2;
  
  return Math.min(risk, 1);
}

/**
 * Recommend action based on risk score
 */
export function recommendModeration(riskScore) {
  if (riskScore >= 0.8) {
    return { action: 'ban', duration: 'permanent', reason: 'High risk user' };
  } else if (riskScore >= 0.6) {
    return { action: 'suspend', duration: '7days', reason: 'Multiple violations' };
  } else if (riskScore >= 0.4) {
    return { action: 'warn', duration: null, reason: 'Suspicious activity' };
  } else {
    return { action: 'monitor', duration: null, reason: 'Low risk' };
  }
}