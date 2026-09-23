// ============================================================
// ContentModeration.gs
// Server-side moderation for task names and descriptions.
// ============================================================

const ContentModeration = {
  VERSION: '1.0',

  // Clear block categories. Exact-word matching is used for profanity/slurs
  // so normal words containing short fragments are not accidentally blocked.
  blockedWords_: [
    // Profanity / abusive language
    'fuck','fucker','fucking','motherfucker','shit','bullshit','bitch','bitches',
    'asshole','arsehole','dickhead','prick','cunt','bastard','wanker','twat',
    'piss','pissed','damn','douchebag','dumbass','jackass','sonofabitch',

    // Sexual / explicit terms
    'porn','porno','pornography','xxx','nudes','nude','naked','sexcam','sexchat',
    'blowjob','handjob','deepthroat','masturbate','masturbation','orgasm',
    'vibrator','dildo','hooker','prostitute','prostitution','escort',
    'onlyfans','sexwork','sexworker',

    // Common sexual solicitation terms
    'sexting','sext','horny','cum','ejaculate','anal','vagina','penis',
    'genitals','boobs','tits','titjob','pussy',

    // Hate/slur terms
    'nigger','nigga','faggot','fag','dyke','kike','spic','chink','gook',
    'wetback','retard','retarded'
  ],

  blockedPhrases_: [
    'send nudes',
    'send me nudes',
    'nudes please',
    'sex for money',
    'sex in exchange',
    'sexual services',
    'sexual service',
    'explicit photos',
    'explicit pictures',
    'porn videos',
    'porn video',
    'porn pictures',
    'porn photos'
  ],

  normalize_: function(value) {
    let s = String(value == null ? '' : value).toLowerCase();

    // Decode a few common substitutions used to bypass word filters.
    s = s.replace(/[4@]/g, 'a')
         .replace(/[3]/g, 'e')
         .replace(/[1!|]/g, 'i')
         .replace(/[0]/g, 'o')
         .replace(/[$5]/g, 's')
         .replace(/[7]/g, 't');

    // Remove zero-width characters and collapse punctuation between letters.
    s = s.replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '');
    s = s.replace(/([a-z])[^a-z0-9\s]+(?=[a-z])/g, '$1');
    s = s.replace(/(.)\1{3,}/g, '$1$1$1');
    s = s.replace(/\s+/g, ' ').trim();

    return s;
  },

  check_: function(value, fieldName) {
    const original = String(value == null ? '' : value).trim();
    if (!original) return {allowed:true, field:fieldName || '', category:'', match:''};

    const normalized = this.normalize_(original);
    const compact = normalized.replace(/\s+/g, '');

    for (let i=0; i<this.blockedPhrases_.length; i++) {
      const phrase = this.normalize_(this.blockedPhrases_[i]);
      if (normalized.indexOf(phrase) >= 0 || compact.indexOf(phrase.replace(/\s+/g, '')) >= 0) {
        return {allowed:false, field:fieldName || '', category:'explicit', match:this.blockedPhrases_[i]};
      }
    }

    // Match word boundaries after normalization. This avoids blocking
    // legitimate words such as "class", "assessment", or "assistance".
    const padded = ' ' + normalized.replace(/[^a-z0-9]+/g, ' ') + ' ';
    for (let i=0; i<this.blockedWords_.length; i++) {
      const word = this.normalize_(this.blockedWords_[i]);
      const obfuscatedPattern = word.split('').join('[^a-z0-9]*');
      const obfuscatedMatch = new RegExp('(^|[^a-z0-9])' + obfuscatedPattern + '($|[^a-z0-9])', 'i').test(normalized);
      if (padded.indexOf(' ' + word + ' ') >= 0 || obfuscatedMatch) {
        const category = ['porn','porno','pornography','xxx','nudes','nude','naked',
          'sexcam','sexchat','blowjob','handjob','deepthroat','masturbate',
          'masturbation','orgasm','vibrator','dildo','hooker','prostitute',
          'prostitution','escort','onlyfans','sexwork','sexworker','sexting',
          'sext','horny','cum','ejaculate','anal','vagina','penis','genitals',
          'boobs','tits','titjob','pussy'].indexOf(word) >= 0 ? 'explicit' :
          ['nigger','nigga','faggot','fag','dyke','kike','spic','chink','gook',
           'wetback','retard','retarded'].indexOf(word) >= 0 ? 'hate_or_slur' :
          'profanity';

        return {allowed:false, field:fieldName || '', category:category, match:this.blockedWords_[i]};
      }
    }

    return {allowed:true, field:fieldName || '', category:'', match:''};
  },

  validateTask_: function(body) {
    const checks = [
      this.check_(body && (body.taskName !== undefined ? body.taskName : body.title), 'taskName'),
      this.check_(body && (body.taskDescription !== undefined ? body.taskDescription : body.description), 'taskDescription')
    ];

    const blocked = checks.find(function(x){ return !x.allowed; });
    if (!blocked) return {allowed:true};

    return {
      allowed:false,
      field:blocked.field,
      category:blocked.category,
      match:blocked.match,
      message:'Your task contains language that is not allowed. Please edit the task name or description and try again.'
    };
  },

  validateTaskValues_: function(taskName, taskDescription) {
    return this.validateTask_({taskName:taskName, taskDescription:taskDescription});
  }
};
