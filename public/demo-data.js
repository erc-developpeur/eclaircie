/* Articles d'exemple (fictifs) utilisés quand le serveur ou les flux RSS sont indisponibles.
   Certains sont volontairement "sensibles" pour montrer le filtre en action. */
(function (root) {
  const H = 3600e3;
  const now = Date.now();
  const raw = [
    ['science', 'Des chercheurs découvrent une nouvelle espèce de corail résistante à la chaleur', 'Cette découverte au large de la Nouvelle-Calédonie redonne espoir pour la protection des récifs face au réchauffement des océans.', 1],
    ['espace', 'Le télescope européen capture l’image la plus nette jamais réalisée d’une galaxie spirale', 'Les astronomes saluent un succès technique qui ouvre la voie à de nouvelles découvertes sur la formation des étoiles.', 2],
    ['war', 'Nouvelles frappes de missiles sur une ville frontalière, l’armée annonce une offensive', 'Les combats se sont intensifiés dans la nuit, selon des sources militaires.', 2],
    ['tech', 'Une startup française lance une appli qui traduit la langue des signes en temps réel', 'Développée avec des associations de sourds et malentendants, l’application est gratuite et fonctionne hors ligne.', 3],
    ['planete', 'Record : l’énergie solaire a couvert 40 % de la consommation européenne en juillet', 'Une première historique qui illustre les progrès rapides des énergies renouvelables sur le continent.', 4],
    ['murder', 'Meurtre dans un quartier résidentiel : un suspect en garde à vue', 'Le corps sans vie de la victime a été retrouvé tôt ce matin par des voisins.', 4],
    ['animaux', 'Le retour des loutres dans la Seine célébré par les naturalistes', 'Après des décennies d’absence, plusieurs familles ont été observées, signe d’une eau de meilleure qualité.', 5],
    ['sport', 'L’équipe de France féminine de rugby remporte un match historique', 'Une victoire éclatante qui qualifie les Bleues pour la finale du tournoi, devant un stade comble.', 6],
    ['cinema', 'Un premier film tourné en Bretagne remporte le prix du public à Annecy', 'La réalisatrice de 27 ans signe un film d’animation poétique sur la mer et la transmission.', 7],
    ['disaster', 'Inondations meurtrières : le bilan des victimes s’alourdit', 'Les secours poursuivent les recherches après le passage de l’ouragan.', 7],
    ['food', 'Ce chef transforme les invendus des marchés en menus gastronomiques solidaires', 'Son restaurant a déjà servi plus de 30 000 repas à prix libre, en luttant contre le gaspillage.', 8],
    ['culture', 'Le musée d’Orsay ouvre une salle immersive gratuite pour les moins de 26 ans', 'Une nouvelle façon de découvrir les impressionnistes, avec une expérience sonore créée par des étudiants.', 9],
    ['sexual', 'Procès pour viol : l’accusé nie les faits', 'L’audience s’est ouverte devant la cour criminelle départementale.', 9],
    ['sante', 'Une étude montre que 20 minutes de marche par jour améliorent nettement le sommeil', 'Les chercheurs ont suivi 4 000 volontaires pendant deux ans : une solution simple et accessible.', 10],
    ['business', 'Les entreprises qui passent à la semaine de quatre jours voient leur productivité progresser', 'Le bilan d’une expérimentation menée dans 60 entreprises françaises est encourageant.', 11],
    ['crisis', 'Crise : l’inflation repart et menace le pouvoir d’achat, alerte un rapport', 'Les économistes s’inquiètent d’une chute de la consommation des ménages.', 12],
    ['voyage', 'Le train de nuit Paris–Berlin affiche complet pour sa première saison', 'Le succès de cette ligne relancée confirme l’envie de voyager autrement, plus lentement.', 13],
    ['musique', 'Un orchestre de jeunes de quartiers populaires joue à la Philharmonie', 'Un concert émouvant, fruit de trois ans d’apprentissage gratuit de la musique classique.', 14],
    ['education', 'Dans cette école rurale, les élèves apprennent le code en jardinant', 'Un projet pédagogique innovant qui mêle robotique et potager, salué par les enseignants.', 15],
    ['polemic', 'Polémique à l’Assemblée : une motion de censure déposée après un nouveau scandale', 'Le clash entre majorité et opposition s’est poursuivi tard dans la nuit.', 16],
    ['gaming', 'Un jeu vidéo indépendant français devient le plus joué de la semaine', 'Créé par une équipe de cinq personnes à Lyon, il séduit par sa direction artistique douce.', 17],
    ['design', 'Une architecte invente des abris d’urgence en carton recyclable montables en 1 heure', 'Le prototype a été testé avec succès et sera déployé par plusieurs ONG.', 18],
    ['terror', 'Alerte attentat : une explosion suspecte provoque l’évacuation d’une gare', 'Les forces de l’ordre ont bouclé le périmètre.', 19],
    ['planete', 'Une forêt urbaine plantée par des habitants abrite déjà 80 espèces', 'Trois ans après sa création, la mini-forêt est devenue un îlot de fraîcheur et de biodiversité.', 20],
  ];
  const DEMO_ARTICLES = raw.map(([hint, title, summary, h], i) => ({
    id: 'demo-' + i,
    title, summary,
    topicHint: hint,
    source: 'Exemple',
    url: '',
    image: '',
    date: new Date(now - h * H).toISOString(),
    demo: true,
  }));
  if (typeof module !== 'undefined' && module.exports) module.exports = DEMO_ARTICLES;
  else root.DEMO_ARTICLES = DEMO_ARTICLES;
})(typeof self !== 'undefined' ? self : this);
