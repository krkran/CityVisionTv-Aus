/* ==========================================================
   CityVision TV — site configuration
   Edit this file to change shows, categories, social links
   and the GitHub repository the newsroom publishes to.
   ========================================================== */
(function (root) {
  var CONFIG = {
    siteName: 'CityVision TV',
    siteUrl: 'https://cityvisiontv.com.au',
    tagline: 'By Nepali, for Nepali. The digital home of the Nepali community in Australia.',
    location: 'Mansfield, Queensland, Australia',
    timezone: 'Australia/Brisbane',
    email: 'cityvisiontvbroadcast@gmail.com',

    // Web3Forms key used by the contact + newsletter forms (sends to the email above)
    web3formsKey: '3e00b24e-7297-4aa4-884d-5a5819b2e466',

    // GitHub repository that hosts the site (GitHub Pages)
    github: { owner: 'krkran', repo: 'CityVisionTv-Aus', branch: 'main' },

    // YouTube channel. youtube.json is refreshed every hour by a GitHub Action
    youtube: { channelId: 'UC_xAWArdrRZYTNfMOwMPtiw', handle: '@CityVision_TV' },

    social: {
      youtube:   'https://youtube.com/@CityVision_TV',
      facebook:  'https://facebook.com/profile.php?id=61575600852772',
      instagram: 'https://instagram.com/cityvisiontv',
      tiktok:    'https://tiktok.com/@cityvisiontv',
      spotify:   'https://open.spotify.com/show/5AyBIxWf3yroPNncxRpsVw'
    },

    // Editorial sections (shown in the main navigation)
    categories: [
      { id: 'news',      name: 'News',      desc: 'The latest news for Nepali-Australians, from our communities, Australia and Nepal.' },
      { id: 'community', name: 'Community', desc: 'People, organisations and milestones across the Nepali community in Australia.' },
      { id: 'culture',   name: 'Culture',   desc: 'Festivals, music, food, film and the traditions we carry with us.' },
      { id: 'diaspora',  name: 'Diaspora',  desc: 'Life between two homes: study, work, visas, family and belonging.' },
      { id: 'events',    name: 'Events',    desc: 'What is on around the community. Send us your event to be listed.' },
      { id: 'opinion',   name: 'Opinion',   desc: 'Perspectives and conversations from voices across the diaspora.' }
    ],

    // CityVision TV programmes
    shows: [
      { id: 'city-vision-reports', yt: ['City Vision Reports', 'CVR'], name: 'City Vision Reports', format: 'News', logo: 'assets/logos/cvr.webp',
        color: '#173149', tile: '#ffffff',
        desc: 'Our news and current affairs programme, reporting on the stories that matter to Nepali-Australians.' },
      { id: 'hamro-story', yt: ['Hamro Story'], name: 'Hamro Story', format: 'Series', logo: 'assets/logos/hamrostory.webp',
        color: '#b8303b', tile: '#fbe9e4',
        desc: 'Real stories of Nepali people building their lives in Australia. New episodes on the last Saturday of every month.' },
      { id: 'kurakani', yt: ['Kurakani'], name: 'Kurakani', format: 'Podcast', logo: 'assets/logos/kurakani.webp',
        color: '#1d1d1f', tile: '#f3efe8', link: 'https://open.spotify.com/show/5AyBIxWf3yroPNncxRpsVw',
        desc: 'Long-form conversations and stories of the diaspora. Listen on Spotify.' },
      { id: 'diaspora-talk', yt: ['Diaspora Talk'], name: 'Diaspora Talk', format: 'Talk show', logo: 'assets/logos/diasporatlak.webp',
        color: '#1f4e9a', tile: '#eaf1fb',
        desc: 'Diaspora Talk with Dr. Bharat Raj Poudel: conversations on the issues shaping the Nepali diaspora.' },
      { id: '8-baje', yt: ['8 Baje', '8 बजे'], name: '8 Baje', format: 'Talk show', logo: 'assets/logos/8baje.png',
        color: '#2b0782', tile: '#efeaff',
        desc: 'Conversations that matter, at eight o’clock.' },
      { id: 'my-days-in-nepal', yt: ['My Days in Nepal'], name: 'My Days in Nepal', format: 'Documentary', logo: 'assets/logos/mydaysinnepal.webp',
        color: '#b4541a', tile: '#fbf0dc',
        desc: 'A Foreigner’s Diary: a documentary series seeing Nepal through fresh eyes.' },
      { id: 'day-in-the-life', yt: ['Day in the Life'], name: 'Day in the Life', format: 'Interviews', logo: '',
        color: '#0e5a5a', tile: '#e4f3f2',
        desc: 'A day alongside members of our community: their work, routines and ambitions.' }
    ],

    postTypes: [
      { id: 'article', name: 'Article' },
      { id: 'video',   name: 'Video' },
      { id: 'update',  name: 'Quick update' }
    ]
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CONFIG;
  else root.CV_CONFIG = CONFIG;
})(this);
