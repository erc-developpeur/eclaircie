/* Éclaircie — catalogue des thèmes + classifieur/filtre partagé (navigateur ET serveur). */
(function (root) {
  const TOPICS = [
    { id: 'science', label: 'Science', emoji: '🔬', kw: ['scientif', 'chercheu', 'etude', 'decouvert', 'physique', 'chimie', 'biolog', 'adn', 'fossile', 'science'] },
    { id: 'espace', label: 'Espace', emoji: '🚀', kw: ['espace', 'nasa', 'esa', 'fusee', 'planete', 'galaxie', 'telescope', 'astronaut', 'lune', 'mars ', 'satellite', 'asteroide'] },
    { id: 'tech', label: 'Tech', emoji: '💡', kw: ['tech', 'intelligence artificielle', ' ia ', 'smartphone', 'apple', 'google', 'logiciel', 'numerique', 'startup', 'robot', 'appli', 'internet', 'cyber'] },
    { id: 'planete', label: 'Planète', emoji: '🌿', kw: ['climat', 'environnement', 'biodiversite', 'ecolog', 'energie', 'solaire', 'eolien', 'foret', 'ocean', 'recyclage', 'renouvelable'] },
    { id: 'sante', label: 'Bien-être', emoji: '🧘', kw: ['sante', 'bien-etre', 'sommeil', 'nutrition', 'sport sante', 'mental', 'medecin', 'traitement', 'therapie'] },
    { id: 'culture', label: 'Culture', emoji: '🎭', kw: ['culture', 'exposition', 'musee', 'livre', 'roman', 'theatre', 'festival', 'patrimoine', 'litterat'] },
    { id: 'cinema', label: 'Cinéma & séries', emoji: '🎬', kw: ['film', 'cinema', 'serie tele', 'nouvelle serie', 'netflix', 'realisat', 'acteur', 'actrice', 'box-office', 'oscar', 'cannes'] },
    { id: 'musique', label: 'Musique', emoji: '🎧', kw: ['musique', 'album', 'concert', 'chanteu', 'rappeu', 'groupe', 'tournee', 'single'] },
    { id: 'sport', label: 'Sport', emoji: '⚽', kw: ['sport', 'football', 'match', 'tennis', 'rugby', 'basket', 'jeux olympiques', 'champion', 'ligue', 'cyclisme', 'f1', 'coupe du monde'] },
    { id: 'business', label: 'Business', emoji: '📈', kw: ['entreprises', 'economie', 'marches financiers', 'bourse', 'emploi', 'investiss', 'croissance', 'business', 'entrepreneur'] },
    { id: 'voyage', label: 'Voyage', emoji: '✈️', kw: ['voyage', 'tourisme', 'destination', 'vacances', ' train ', 'randonnee', 'hotel'] },
    { id: 'food', label: 'Cuisine', emoji: '🍜', kw: ['cuisine', 'recette', 'chef cuisinier', 'chef etoile', 'restaurant', 'gastronom', 'patisserie', 'vin '] },
    { id: 'animaux', label: 'Animaux', emoji: '🦜', kw: ['animal', 'animaux', 'espece', 'chien', 'chat', 'oiseau', 'baleine', 'faune', 'zoo', 'refuge'] },
    { id: 'education', label: 'Éducation', emoji: '🎓', kw: ['ecole', 'education', 'eleve', 'universite', 'etudiant', 'enseign', 'apprentissage'] },
    { id: 'design', label: 'Art & design', emoji: '🎨', kw: ['design', 'architecture', 'artiste', 'peinture', 'photograph', 'mode '] },
    { id: 'gaming', label: 'Jeux vidéo', emoji: '🎮', kw: ['jeu video', 'jeux video', 'nintendo', 'playstation', 'xbox', 'gaming', 'esport'] },
    { id: 'politique', label: 'Politique', emoji: '🏛️', kw: ['gouvernement', 'ministre', 'president', 'election', 'assemblee', 'senat', 'depute', 'parti', 'loi '] },
    { id: 'monde', label: 'Monde', emoji: '🌍', kw: ['international', 'monde', 'onu', 'europe', 'diplomat', 'sommet'] },
  ];

  // Précisions par thème : [id, libellé, racines].
  const SUBTOPICS = {
    science: [['archeo', 'Archéologie', ['archeolog', 'fouille', 'vestige']], ['paleo', 'Paléontologie', ['fossile', 'dinosaure', 'paleonto']], ['physique', 'Physique', ['physique', 'quantique', 'particule']], ['biologie', 'Biologie & génétique', ['adn', 'gene', 'biolog', 'cellule']]],
    espace: [['mars', 'Mars', ['mars ']], ['lune', 'Lune', ['lune', 'artemis']], ['spacex', 'SpaceX', ['spacex', 'starship']], ['telescopes', 'Télescopes', ['telescope', 'james webb', 'hubble']], ['exoplanetes', 'Exoplanètes', ['exoplanete']]],
    tech: [['ia', 'Intelligence artificielle', ['intelligence artificielle', ' ia ', 'chatgpt', 'openai', 'mistral', 'gemini', 'anthropic']], ['smartphones', 'Smartphones', ['smartphone', 'iphone', 'android', 'samsung']], ['cyber', 'Cybersécurité', ['cyber', 'piratage', 'hacker', 'faille']], ['startups', 'Startups', ['startup', 'levee de fonds', 'licorne']], ['ve', 'Voitures électriques', ['voiture electrique', 'tesla', 'batterie']]],
    planete: [['climat', 'Climat', ['climat', 'rechauffement', 'co2']], ['energie', 'Énergies renouvelables', ['solaire', 'eolien', 'renouvelable']], ['biodiv', 'Biodiversité', ['biodiversite', 'faune', 'flore']], ['ocean', 'Océans', ['ocean', 'marin', 'corail']]],
    sante: [['sommeil', 'Sommeil', ['sommeil', 'dormir']], ['nutrition', 'Nutrition', ['nutrition', 'alimentation']], ['mental', 'Santé mentale', ['sante mentale', 'stress', 'meditation']], ['activite', 'Activité physique', ['marche', 'course a pied', 'activite physique']]],
    culture: [['livres', 'Livres', ['livre', 'roman', 'ecrivain', 'goncourt']], ['expos', 'Expositions', ['exposition', 'musee']], ['spectacles', 'Théâtre & spectacles', ['theatre', 'spectacle', 'danse']], ['patrimoine', 'Patrimoine', ['patrimoine', 'chateau', 'monument']]],
    cinema: [['films', 'Films', ['film']], ['series', 'Séries', ['serie', 'netflix', 'disney+']], ['animation', 'Animation & manga', ['animation', 'pixar', 'anime', 'manga']], ['festivals', 'Festivals & prix', ['cannes', 'cesar', 'oscar']]],
    musique: [['rap', 'Rap', ['rap', 'rappeu']], ['pop', 'Pop', ['pop ']], ['electro', 'Électro', ['electro', ' dj ']], ['classique', 'Classique', ['classique', 'orchestre', 'opera']], ['concerts', 'Concerts', ['concert', 'tournee']]],
    sport: [['foot', 'Football', ['football', 'ligue 1', 'ligue des champions', 'psg', 'mbappe']], ['tennis', 'Tennis', ['tennis', 'roland-garros', 'wimbledon']], ['rugby', 'Rugby', ['rugby', 'top 14']], ['f1', 'Formule 1', [' f1', 'formule 1', 'grand prix']], ['basket', 'Basket', ['basket', 'nba', 'wembanyama']], ['cyclisme', 'Cyclisme', ['cyclisme', 'tour de france']], ['gym', 'Gymnastique', ['gymnast']], ['golf', 'Golf', ['golf']]],
    business: [['bourse', 'Bourse', ['bourse', 'cac 40']], ['emploi', 'Emploi', ['emploi', 'recrutement', 'salaire']], ['entrepreneuriat', 'Entrepreneuriat', ['entrepreneur', 'creation d entreprise']], ['crypto', 'Crypto', ['crypto', 'bitcoin', 'blockchain']]],
    voyage: [['train', 'Train', ['train', 'sncf']], ['nature', 'Nature & randonnée', ['randonnee', 'montagne', 'parc national']], ['citytrip', 'City-trips', ['week-end a', 'capitale']]],
    food: [['recettes', 'Recettes', ['recette']], ['restos', 'Restaurants', ['restaurant', 'etoile']], ['vegetal', 'Cuisine végétale', ['vegan', 'vegetarien', 'vegetal']], ['vin', 'Vins', ['vin ', 'vigne', 'vignoble']]],
    animaux: [['compagnie', 'Animaux de compagnie', ['chien', 'chat ']], ['sauvage', 'Faune sauvage', ['sauvage', 'loup', 'ours', 'baleine']], ['oiseaux', 'Oiseaux', ['oiseau']], ['protection', 'Protection animale', ['refuge', 'maltraitance', 'protection animale']]],
    education: [['ecole', 'École', ['ecole', 'eleve']], ['etudes', 'Études supérieures', ['universite', 'etudiant', 'parcoursup']], ['orientation', 'Orientation & métiers', ['orientation', 'metier']]],
    design: [['archi', 'Architecture', ['architect']], ['photo', 'Photographie', ['photograph']], ['mode', 'Mode', [' mode ', 'fashion', 'defile']]],
    gaming: [['nintendo', 'Nintendo', ['nintendo', 'switch', 'zelda', 'mario']], ['playstation', 'PlayStation', ['playstation', 'ps5']], ['xbox', 'Xbox', ['xbox']], ['pcgaming', 'PC', ['steam']], ['esport', 'E-sport', ['esport', 'e-sport']]],
    politique: [['france', 'France', ['gouvernement', 'assemblee', 'senat']], ['europe', 'Union européenne', ['bruxelles', 'commission europeenne', 'parlement europeen']], ['local', 'Local', ['mairie', 'maire ', 'municipal']]],
    monde: [['afrique', 'Afrique', ['afrique', 'senegal', 'maroc', 'cote d ivoire', 'algerie']], ['ameriques', 'Amériques', ['etats-unis', 'canada', 'bresil', 'quebec']], ['asie', 'Asie', ['chine', 'japon', 'inde', 'coree']], ['europe_m', 'Europe', ['allemagne', 'espagne', 'italie', 'belgique', 'suisse']]],
  };
  const SUB_INDEX = Object.entries(SUBTOPICS).flatMap(([topic, list]) => list.map(([id, label, kw]) => ({ id, label, kw, topic })));

  // Catalogue des sources (utilisé par le serveur pour lire les flux, et par l'app pour les choisir).
  const SOURCES = [
    { id: 'lemonde', name: 'Le Monde', cat: 'Généraliste', url: 'https://www.lemonde.fr/rss/une.xml' },
    { id: 'franceinfo', name: 'Franceinfo', cat: 'Généraliste', url: 'https://www.francetvinfo.fr/titres.rss' },
    { id: 'liberation', name: 'Libération', cat: 'Généraliste', url: 'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml' },
    { id: 'ouestfrance', name: 'Ouest-France', cat: 'Généraliste', url: 'https://www.ouest-france.fr/rss/une' },
    { id: 'lefigaro', name: 'Le Figaro', cat: 'Généraliste', url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
    { id: 'nouvelobs', name: 'L’Obs', cat: 'Généraliste', url: 'https://www.nouvelobs.com/a-la-une/rss.xml' },
    { id: 'leparisien', name: 'Le Parisien', cat: 'Généraliste', url: 'https://feeds.leparisien.fr/leparisien/rss' },
    { id: '20minutes', name: '20 Minutes', cat: 'Généraliste', url: 'https://www.20minutes.fr/feeds/rss-une.xml' },
    { id: 'lacroix', name: 'La Croix', cat: 'Généraliste', url: 'https://www.la-croix.com/RSS/UNIVERS' },
    { id: 'lesechos', name: 'Les Échos', cat: 'Économie', url: 'https://syndication.lesechos.fr/rss/rss_une.xml', hint: 'business' },
    { id: 'france24', name: 'France 24', cat: 'International', url: 'https://www.france24.com/fr/rss' },
    { id: 'courrier', name: 'Courrier international', cat: 'International', url: 'https://www.courrierinternational.com/feed/all/rss.xml' },
    { id: 'positivr', name: 'Positivr', cat: 'Bonnes nouvelles', url: 'https://positivr.fr/feed/' },
    { id: 'numerama', name: 'Numerama', cat: 'Tech & science', url: 'https://www.numerama.com/feed/', hint: 'tech' },
    { id: 'lesnum', name: 'Les Numériques', cat: 'Tech & science', url: 'https://www.lesnumeriques.com/rss.xml', hint: 'tech' },
    { id: 'futura', name: 'Futura Sciences', cat: 'Tech & science', url: 'https://www.futura-sciences.com/rss/actualites.xml', hint: 'science' },
    { id: 'sciavenir', name: 'Sciences et Avenir', cat: 'Tech & science', url: 'https://www.sciencesetavenir.fr/rss.xml', hint: 'science' },
    { id: 'reporterre', name: 'Reporterre', cat: 'Environnement', url: 'https://reporterre.net/spip.php?page=backend', hint: 'planete' },
    { id: 'lequipe', name: 'L’Équipe', cat: 'Sport', url: 'https://dwh.lequipe.fr/api/edito/rss?path=/', hint: 'sport' },
  ];

  // Thèmes que l'utilisateur peut bloquer. Les mots-clés sont des racines (texte normalisé sans accents).
  // Préfixe "=" : mot entier (expression régulière), pour éviter par ex. "attaque" ⊂ "attaquant".
  // On inclut aussi les mots de *contexte* (hommage, minute de silence, solidarité…) : un article de sport
  // qui reporte des matchs après un drame parle quand même du drame.
  const SENSITIVE = [
    { id: 'war', label: 'Guerres & conflits armés', emoji: '🪖', kw: ['guerre', 'bombard', 'missile', 'frappe aerienne', 'frappes', 'armee', 'soldat', 'militaire', 'invasion', 'drone', 'combat', 'offensive', 'conflit arme', ' war ', 'airstrike', 'troops'] },
    { id: 'murder', label: 'Meurtres & homicides', emoji: '🔪', kw: ['meurtre', 'homicide', 'assassin', 'tue par', 'tuee', 'poignard', 'feminicide', 'cadavre', 'corps sans vie', 'murder', 'killed', 'abattu'] },
    { id: 'sexual', label: 'Violences sexuelles', emoji: '🚫', kw: ['viol', 'agression sexuelle', 'pedocrimin', 'inceste', 'harcelement sexuel', 'abus sexuel', 'rape', 'sexual assault'] },
    { id: 'violence', label: 'Agressions & faits divers', emoji: '⚠️', kw: ['agression', 'agresse', 'fusillade', 'rixe', 'violence', 'blesse', 'arme a feu', 'enlevement', 'braquage', 'garde a vue', 'interpelle', 'shooting',
      '=attaques?', 'attaque au couteau', 'coups de couteau', 'pris pour cible', '=emeutes?', 'lynchage', 'expedition punitive', 'suspect', 'exprime sa solidarite', 'cellule psychologique', 'sous le choc'] },
    { id: 'terror', label: 'Terrorisme', emoji: '💥', kw: ['terroris', 'attentat', 'djihad', 'explosion', 'kamikaze', 'otage', 'attaque au couteau', 'radicalis', 'fiche s ', 'parquet national antiterroriste', 'pnat'] },
    { id: 'disaster', label: 'Catastrophes & accidents', emoji: '🌪️', kw: ['catastrophe', 'seisme', 'tremblement de terre', 'inondation', 'ouragan', 'incendie', 'crash', 'accident', 'naufrage', 'tsunami', 'victimes'] },
    { id: 'death', label: 'Décès & deuil', emoji: '🕯️', kw: ['deces', 'mort ', 'morts', 'meurt', 'decede', 'obseques', 'deuil', 'disparition de', 'died', 'dead',
      'minute de silence', 'hommage aux victimes', 'marche blanche', 'en memoire de', '=drames?', 'tragedie', 'tragique', 'endeuill'] },
    { id: 'disease', label: 'Épidémies & maladies graves', emoji: '🦠', kw: ['epidemie', 'pandemie', 'virus', 'cancer', 'contamin', 'variant', 'outbreak'] },
    { id: 'polemic', label: 'Polémiques politiques', emoji: '📢', kw: ['polemique', 'scandale', 'motion de censure', 'clash', 'tollé', 'tolle', 'demission', 'mise en examen'] },
    { id: 'crisis', label: 'Crises & récession', emoji: '📉', kw: ['crise', 'recession', 'inflation', 'faillite', 'licenciement', 'chomage', 'krach', 'penurie'] },
  ];

  const NEG = ['mort', 'tue', 'drame', 'tragique', 'crise', 'menace', 'peur', 'alerte', 'chute', 'effondre', 'victime', 'grave', 'inquiet', 'danger', 'colere', 'echec', 'condamne', 'polemique', 'violence', 'guerre', 'scandale', 'penurie', 'catastroph', 'deces', 'attaque'];
  const POS = ['record', 'reussi', 'succes', 'premiere', 'innov', 'decouvr', 'sauve', 'solution', 'progres', 'espoir', 'celebr', 'inaugur', 'gagne', 'victoire', 'prix', 'nouveau', 'lance', 'renaissance', 'retour', 'protege', 'bonne nouvelle', 'champion', 'joie'];

  function normalize(s) {
    return (' ' + String(s || '') + ' ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'"«»]/g, ' ');
  }
  const has = (text, kw) => text.includes(kw);
  // "viol" ne doit pas matcher "violon" / "violet" / "violence" : on exige une frontière après les racines courtes.
  const hasStrict = (text, kw) => kw[0] === '=' ? new RegExp('[^a-z]' + kw.slice(1) + '[^a-z]').test(text) : kw.length > 5 || kw.includes(' ') ? text.includes(kw) : new RegExp('[^a-z]' + kw + '(s|e|es|ee|ees)?[^a-z]').test(text);

  function heuristicClassify(a) {
    const t = normalize(a.title + ' ' + (a.summary || ''));
    const scores = TOPICS.map(tp => ({ id: tp.id, n: tp.kw.filter(k => has(t, k)).length }));
    scores.sort((x, y) => y.n - x.n);
    const sensitive = SENSITIVE.filter(c => c.kw.some(k => hasStrict(t, k))).map(c => c.id);
    const neg = NEG.filter(w => has(t, w)).length + sensitive.length;
    const pos = POS.filter(w => has(t, w)).length;
    const tone = Math.max(-1, Math.min(1, (pos - neg) / Math.max(2, pos + neg)));
    const hint = TOPICS.some(tp => tp.id === a.topicHint) ? a.topicHint : null;
    return { topic: hint || (scores[0].n ? scores[0].id : 'monde'), sensitive, tone: Math.round(tone * 100) / 100, by: 'mots-clés' };
  }

  // prefs: { topics:[], subtopics:[], interests:[], sources:[ids]|null, blocked:[], tone:0..100, keywords:[] }
  //   tone 0 = uniquement des nouvelles positives, 100 = toute l'actualité factuelle.
  //   sources null = toutes. Les articles d'une source décochée sont ignorés (ce n'est pas le bouclier).
  function filterArticles(articles, prefs) {
    prefs = prefs || {};
    const blocked = new Set(prefs.blocked || []);
    const kws = (prefs.keywords || []).map(k => normalize(k).trim()).filter(Boolean);
    const sources = Array.isArray(prefs.sources) ? new Set(prefs.sources) : null;
    const subs = SUB_INDEX.filter(s => (prefs.subtopics || []).includes(s.id));
    const interests = (prefs.interests || []).map(k => [k, normalize(k).trim()]).filter(([, n]) => n.length > 1);
    const minTone = 0.1 - ((prefs.tone == null ? 40 : prefs.tone) / 100) * 1.2;
    const hidden = {};
    const bump = r => (hidden[r] = (hidden[r] || 0) + 1);
    const visible = [];
    const fav = new Set(prefs.topics || []);
    for (const a of articles) {
      if (sources && a.sourceId && !a.sourceId.startsWith('custom:') && !sources.has(a.sourceId)) continue;
      const c = a.ai || heuristicClassify(a);
      const hit = c.sensitive.find(s => blocked.has(s));
      if (hit) { bump(hit); continue; }
      const text = normalize(a.title + ' ' + (a.summary || ''));
      if (kws.some(k => text.includes(k))) { bump('keyword'); continue; }
      if (c.tone < minTone) { bump('tone'); continue; }
      const match = {
        interests: interests.filter(([, n]) => text.includes(' ' + n) || text.includes(n + ' ')).map(([k]) => k),
        subs: subs.filter(s => s.kw.some(k => text.includes(k))).map(s => s.label),
      };
      const score = match.interests.length * 3 + match.subs.length * 2 + fav.has(c.topic);
      visible.push(Object.assign({}, a, { ai: c, match, score }));
    }
    // Intérêts précis > précisions > thèmes suivis, puis par date.
    visible.sort((x, y) => (y.score - x.score) || (new Date(y.date) - new Date(x.date)));
    return { visible, hidden, hiddenTotal: Object.values(hidden).reduce((s, n) => s + n, 0) };
  }

  // Décide si une notification peut partir maintenant selon le rythme choisi.
  // log = { date:'AAAA-MM-JJ', slots:[], count, last } (envois du jour). Renvoie le créneau à marquer, ou null.
  function notifDue(n, log, date) {
    const d = date || new Date();
    const now = d.toTimeString().slice(0, 5);
    const today = d.toISOString().slice(0, 10);
    if (!log || log.date !== today) log = { date: today, slots: [], count: 0, last: 0 };
    const { quietStart: qs, quietEnd: qe } = n;
    if (qs && qe && (qs < qe ? (now >= qs && now < qe) : (now >= qs || now < qe))) return null;
    const max = n.maxPerDay || 3;
    if (n.freq === 'daily') return now >= n.time && !log.slots.includes('a') ? 'a' : null;
    if (n.freq === 'twice') {
      if (now >= n.time2 && !log.slots.includes('b')) return 'b';
      if (now >= n.time && now < n.time2 && !log.slots.includes('a')) return 'a';
      return null;
    }
    if (n.freq === 'day') {
      if (now < n.time || now >= n.time2 || log.count >= max) return null;
      const [h1, m1] = n.time.split(':').map(Number), [h2, m2] = n.time2.split(':').map(Number);
      const gap = ((h2 * 60 + m2) - (h1 * 60 + m1)) / max * 60e3; // envois répartis sur le créneau
      return d - log.last >= gap ? 'd' + log.count : null;
    }
    return log.count < max ? 'l' + log.count : null; // live
  }
  function markSent(log, slot, date) {
    const d = date || new Date(), today = d.toISOString().slice(0, 10);
    if (!log || log.date !== today) log = { date: today, slots: [], count: 0, last: 0 };
    return { date: today, slots: [...log.slots, slot], count: log.count + 1, last: +d };
  }

  const api = { TOPICS, SUBTOPICS, SOURCES, SENSITIVE, normalize, heuristicClassify, filterArticles, notifDue, markSent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Eclaircie = api;
})(typeof self !== 'undefined' ? self : this);
