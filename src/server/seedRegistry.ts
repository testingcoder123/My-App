export interface SeedRegistrySite {
  name: string;
  searchDomain: string;
  group: string;
  createUrl: string;
  enabled: boolean;
}

const RAW_GROUPS: Array<{
  group: string;
  domains: Array<{ domain: string; name?: string; createUrl?: string }>;
}> = [
  {
    group: 'Business & Maps',
    domains: [
      { domain: 'google.com/maps', name: 'Google Business Profile', createUrl: 'https://www.google.com/business/' },
      { domain: 'g.page', name: 'Google Business Profile (g.page)', createUrl: 'https://www.google.com/business/' },
      { domain: 'bing.com/maps', name: 'Bing Places', createUrl: 'https://www.bingplaces.com/' },
      { domain: 'maps.apple.com', name: 'Apple Business Connect', createUrl: 'https://businessconnect.apple.com/' },
      { domain: 'foursquare.com', name: 'Foursquare', createUrl: 'https://foursquare.com/add-place' },
      { domain: 'mapquest.com', name: 'MapQuest', createUrl: 'https://www.mapquest.com/' },
      { domain: 'openstreetmap.org', name: 'OpenStreetMap', createUrl: 'https://www.openstreetmap.org/user/new' },
      { domain: 'wego.here.com', name: 'HERE WeGo', createUrl: 'https://mapcreator.here.com/' },
      { domain: 'waze.com', name: 'Waze', createUrl: 'https://www.waze.com/editor' },
      { domain: 'nextdoor.com', name: 'Nextdoor Business', createUrl: 'https://business.nextdoor.com/' },
      { domain: 'mappls.com', name: 'Mappls (MapmyIndia)', createUrl: 'https://about.mappls.com/' },
      { domain: 'zeemaps.com', name: 'ZeeMaps', createUrl: 'https://www.zeemaps.com/' },
      { domain: 'place123.net', name: 'Place123', createUrl: 'https://www.place123.net/' },
      { domain: 'vymaps.com', name: 'VYMaps', createUrl: 'https://www.vymaps.com/' },
      { domain: 'onmap.ae', name: 'OnMap UAE', createUrl: 'https://onmap.ae/' },
      { domain: 'cityof.com', name: 'CityOf.com', createUrl: 'https://www.cityof.com/' },
    ],
  },
  {
    group: 'Reviews & Reputation',
    domains: [
      { domain: 'yelp.com', name: 'Yelp', createUrl: 'https://biz.yelp.com/' },
      { domain: 'trustpilot.com', name: 'Trustpilot', createUrl: 'https://business.trustpilot.com/signup' },
      { domain: 'tripadvisor.com', name: 'Tripadvisor', createUrl: 'https://www.tripadvisor.com/Owners' },
      { domain: 'bbb.org', name: 'Better Business Bureau (BBB)', createUrl: 'https://www.bbb.org/get-listed' },
      { domain: 'sitejabber.com', name: 'Sitejabber', createUrl: 'https://www.sitejabber.com/business' },
      { domain: 'smartcustomer.com', name: 'SmartCustomer', createUrl: 'https://www.smartcustomer.com/' },
      { domain: 'bizratings.com', name: 'BizRatings', createUrl: 'https://www.bizratings.com/' },
      { domain: 'threebestrated.com', name: 'ThreeBestRated', createUrl: 'https://threebestrated.com/submit-business' },
      { domain: 'provenexpert.com', name: 'ProvenExpert', createUrl: 'https://www.provenexpert.com/en-us/signup/' },
      { domain: 'fastexpert.com', name: 'FastExpert', createUrl: 'https://www.fastexpert.com/' },
      { domain: 'whatsyourhours.com', name: 'WhatsYourHours', createUrl: 'https://www.whatsyourhours.com/' },
    ],
  },
  {
    group: 'B2B / Software / Agency',
    domains: [
      { domain: 'g2.com', name: 'G2', createUrl: 'https://sell.g2.com/create-a-profile' },
      { domain: 'capterra.com', name: 'Capterra', createUrl: 'https://www.capterra.com/vendors/sign-up' },
      { domain: 'clutch.co', name: 'Clutch', createUrl: 'https://clutch.co/get-listed' },
      { domain: 'themanifest.com', name: 'The Manifest', createUrl: 'https://themanifest.com/' },
      { domain: 'goodfirms.co', name: 'GoodFirms', createUrl: 'https://www.goodfirms.co/get-listed' },
      { domain: 'designrush.com', name: 'DesignRush', createUrl: 'https://www.designrush.com/agency/submit' },
      { domain: 'sortlist.com', name: 'Sortlist', createUrl: 'https://www.sortlist.com/apply' },
      { domain: 'softwareadvice.com', name: 'Software Advice', createUrl: 'https://www.softwareadvice.com/vendors/' },
      { domain: 'getapp.com', name: 'GetApp', createUrl: 'https://www.getapp.com/' },
      { domain: 'sourceforge.net', name: 'SourceForge', createUrl: 'https://sourceforge.net/software/vendors/new/' },
      { domain: 'featuredcustomers.com', name: 'FeaturedCustomers', createUrl: 'https://www.featuredcustomers.com/vendor-registration' },
    ],
  },
  {
    group: 'Social',
    domains: [
      { domain: 'facebook.com', name: 'Facebook', createUrl: 'https://www.facebook.com/pages/create' },
      { domain: 'instagram.com', name: 'Instagram', createUrl: 'https://www.instagram.com/accounts/emailsignup/' },
      { domain: 'linkedin.com', name: 'LinkedIn', createUrl: 'https://www.linkedin.com/company/setup/new/' },
      { domain: 'x.com', name: 'X (Twitter)', createUrl: 'https://x.com/i/flow/signup' },
      { domain: 'twitter.com', name: 'Twitter (Legacy Domain)', createUrl: 'https://x.com/i/flow/signup' },
      { domain: 'pinterest.com', name: 'Pinterest Business', createUrl: 'https://www.pinterest.com/business/create/' },
      { domain: 'tiktok.com', name: 'TikTok Business', createUrl: 'https://www.tiktok.com/business/' },
      { domain: 'threads.net', name: 'Threads', createUrl: 'https://www.threads.net/' },
      { domain: 'bsky.app', name: 'Bluesky', createUrl: 'https://bsky.app/' },
      { domain: 'patreon.com', name: 'Patreon', createUrl: 'https://www.patreon.com/create' },
      { domain: '500px.com', name: '500px', createUrl: 'https://500px.com/signup' },
      { domain: 'socialsocial.social', name: 'SocialSocial', createUrl: 'https://socialsocial.social/' },
    ],
  },
  {
    group: 'Q&A / Forums / Dev',
    domains: [
      { domain: 'reddit.com', name: 'Reddit', createUrl: 'https://www.reddit.com/register/' },
      { domain: 'quora.com', name: 'Quora', createUrl: 'https://www.quora.com/' },
      { domain: 'stackoverflow.com', name: 'Stack Overflow', createUrl: 'https://stackoverflow.com/users/signup' },
      { domain: 'stackexchange.com', name: 'Stack Exchange', createUrl: 'https://stackexchange.com/' },
      { domain: 'news.ycombinator.com', name: 'Hacker News', createUrl: 'https://news.ycombinator.com/submit' },
      { domain: 'indiehackers.com', name: 'Indie Hackers', createUrl: 'https://www.indiehackers.com/products/new' },
      { domain: 'github.com', name: 'GitHub', createUrl: 'https://github.com/organizations/plan' },
      { domain: 'discord.com', name: 'Discord', createUrl: 'https://discord.com/servers' },
    ],
  },
  {
    group: 'General Directories & Citations',
    domains: [
      { domain: 'yellowpages.com', name: 'YellowPages.com', createUrl: 'https://www.yellowpages.com/claim-your-business' },
      { domain: 'hotfrog.com', name: 'Hotfrog', createUrl: 'https://www.hotfrog.com/add-your-business' },
      { domain: 'cylex.us.com', name: 'Cylex US', createUrl: 'https://www.cylex.us.com/add-company.html' },
      { domain: 'brownbook.net', name: 'Brownbook', createUrl: 'https://www.brownbook.net/business/add/' },
      { domain: 'manta.com', name: 'Manta', createUrl: 'https://www.manta.com/claim' },
      { domain: 'superpages.com', name: 'Superpages', createUrl: 'https://www.superpages.com/' },
      { domain: 'merchantcircle.com', name: 'MerchantCircle', createUrl: 'https://www.merchantcircle.com/signup' },
      { domain: 'ezlocal.com', name: 'EZlocal', createUrl: 'https://ezlocal.com/newbusiness/' },
      { domain: 'hub.biz', name: 'Hub.biz', createUrl: 'https://www.hub.biz/' },
      { domain: '2findlocal.com', name: '2FindLocal', createUrl: 'https://www.2findlocal.com/b/add' },
      { domain: 'tupalo.com', name: 'Tupalo', createUrl: 'https://tupalo.com/en/spot/new' },
      { domain: 'yalwa.com', name: 'Yalwa', createUrl: 'https://www.yalwa.com/' },
      { domain: 'opendi.us', name: 'Opendi US', createUrl: 'https://www.opendi.us/' },
      { domain: 'kompass.com', name: 'Kompass', createUrl: 'https://us.kompass.com/registerNewCompany' },
      { domain: 'thomasnet.com', name: 'Thomasnet', createUrl: 'https://www.thomasnet.com/get-listed' },
      { domain: 'alignable.com', name: 'Alignable', createUrl: 'https://www.alignable.com/biz_users/sign_up' },
      { domain: 'chamberofcommerce.com', name: 'Chamber of Commerce', createUrl: 'https://www.chamberofcommerce.com/add-business' },
      { domain: 'enrollbusiness.com', name: 'EnrollBusiness', createUrl: 'https://www.enrollbusiness.com/' },
      { domain: 'yplocal.com', name: 'YPLocal', createUrl: 'https://www.yplocal.com/' },
      { domain: 'n49.com', name: 'n49', createUrl: 'https://www.n49.com/add-business' },
      { domain: 'find-us-here.com', name: 'Find Us Here', createUrl: 'https://www.find-us-here.com/' },
      { domain: 'storeboard.com', name: 'Storeboard', createUrl: 'https://www.storeboard.com/join/' },
      { domain: 'freebusinessdirectory.com', name: 'Free Business Directory', createUrl: 'https://www.freebusinessdirectory.com/' },
      { domain: 'locable.com', name: 'Locable', createUrl: 'https://www.locable.com/' },
      { domain: 'bizcommunity.com', name: 'Bizcommunity', createUrl: 'https://www.bizcommunity.com/' },
      { domain: 'a-zbusinessfinder.com', name: 'A-Z Business Finder', createUrl: 'https://www.a-zbusinessfinder.com/' },
      { domain: 'bizhwy.com', name: 'BizHwy', createUrl: 'https://www.bizhwy.com/add.php' },
      { domain: 'cargodirectory.co', name: 'Cargo Directory', createUrl: 'https://cargodirectory.co/' },
      { domain: 'marketlister.com', name: 'MarketLister', createUrl: 'https://www.marketlister.com/' },
      { domain: 'submityourstore.com', name: 'SubmitYourStore', createUrl: 'https://www.submityourstore.com/' },
      { domain: 'qkeen.com', name: 'QKeen', createUrl: 'https://www.qkeen.com/' },
      { domain: 'onemilliondirectory.com', name: 'One Million Directory', createUrl: 'https://onemilliondirectory.com/' },
      { domain: 'blinx.biz', name: 'Blinx.biz', createUrl: 'https://blinx.biz/' },
      { domain: 'world-business-zone.com', name: 'World Business Zone', createUrl: 'https://www.world-business-zone.com/' },
      { domain: 'qdexx.com', name: 'Qdexx', createUrl: 'https://www.qdexx.com/' },
      { domain: 'choice.directory', name: 'Choice Directory', createUrl: 'https://choice.directory/' },
      { domain: 'techdirectory.io', name: 'TechDirectory.io', createUrl: 'https://www.techdirectory.io/' },
      { domain: 'freelistingusa.com', name: 'FreeListingUSA', createUrl: 'https://www.freelistingusa.com/' },
      { domain: 'smallbusinessusa.com', name: 'SmallBusinessUSA', createUrl: 'https://www.smallbusinessusa.com/' },
      { domain: 'smallbizamerica.org', name: 'SmallBizAmerica', createUrl: 'https://smallbizamerica.org/' },
      { domain: 'americasmallbiz.com', name: 'AmericaSmallBiz', createUrl: 'https://americasmallbiz.com/' },
      { domain: 'announceamerica.com', name: 'AnnounceAmerica', createUrl: 'https://announceamerica.com/' },
      { domain: 'bizbuildboom.com', name: 'BizBuildBoom', createUrl: 'https://bizbuildboom.com/' },
      { domain: 'nextbizthing.com', name: 'NextBizThing', createUrl: 'https://www.nextbizthing.com/' },
      { domain: 'bigbizmaker.com', name: 'BigBizMaker', createUrl: 'https://bigbizmaker.com/' },
      { domain: 'nextbizmaker.com', name: 'NextBizMaker', createUrl: 'https://nextbizmaker.com/' },
      { domain: 'bizbangboom.com', name: 'BizBangBoom', createUrl: 'https://bizbangboom.com/' },
      { domain: 'bizforgeusa.com', name: 'BizForgeUSA', createUrl: 'https://bizforgeusa.com/' },
      { domain: 'bizlinkbuilder.com', name: 'BizLinkBuilder', createUrl: 'https://bizlinkbuilder.com/' },
      { domain: 'linkcentre.com', name: 'LinkCentre', createUrl: 'https://www.linkcentre.com/' },
      { domain: 'blogbangboom.com', name: 'BlogBangBoom', createUrl: 'https://blogbangboom.com/' },
      { domain: 'seo-citations.com', name: 'SEO Citations', createUrl: 'https://seo-citations.com/' },
      { domain: 'topgoogle.com', name: 'TopGoogle', createUrl: 'https://www.topgoogle.com/' },
      { domain: 'trustlink.org', name: 'TrustLink', createUrl: 'https://www.trustlink.org/' },
      { domain: 'addyp.com', name: 'AddYP', createUrl: 'https://www.addyp.com/' },
      { domain: 'thebuildermarket.com', name: 'The Builder Market', createUrl: 'https://www.thebuildermarket.com/' },
      { domain: 'insertbiz.com', name: 'InsertBiz', createUrl: 'https://insertbiz.com/' },
      { domain: 'getlisteduae.com', name: 'GetListed UAE', createUrl: 'https://www.getlisteduae.com/' },
      { domain: 'getbusiness.co.in', name: 'GetBusiness India', createUrl: 'https://www.getbusiness.co.in/' },
      { domain: 'indocanadianbusinesspages.com', name: 'Indo-Canadian Business Pages', createUrl: 'https://www.indocanadianbusinesspages.com/' },
      { domain: 'countrypwr.com', name: 'CountryPwr', createUrl: 'https://countrypwr.com/' },
      { domain: 'findtheneedle.co.uk', name: 'FindTheNeedle UK', createUrl: 'https://www.findtheneedle.co.uk/' },
      { domain: 'weboworld.com', name: 'WeboWorld', createUrl: 'https://www.weboworld.com/' },
      { domain: 'meetyourmarkets.com', name: 'MeetYourMarkets', createUrl: 'https://www.meetyourmarkets.com/' },
      { domain: 'zumvu.com', name: 'Zumvu', createUrl: 'https://www.zumvu.com/' },
      { domain: 'thetoptens.com', name: 'TheTopTens', createUrl: 'https://www.thetoptens.com/' },
      { domain: 'canadaone.com', name: 'CanadaOne', createUrl: 'https://www.canadaone.com/' },
      { domain: 'webforcompany.com', name: 'WebForCompany', createUrl: 'https://webforcompany.com/' },
      { domain: 'anibookmark.com', name: 'AniBookmark', createUrl: 'https://www.anibookmark.com/' },
      { domain: 'mylifegb.com', name: 'MyLifeGB', createUrl: 'https://www.mylifegb.com/' },
      { domain: 'trueen.com', name: 'Trueen', createUrl: 'https://trueen.com/' },
    ],
  },
  {
    group: 'Classifieds',
    domains: [
      { domain: 'locanto.com', name: 'Locanto', createUrl: 'https://www.locanto.com/post/' },
      { domain: 'classi4u.com', name: 'Classi4U', createUrl: 'https://www.classi4u.com/' },
      { domain: 'dewalist.com', name: 'Dewalist', createUrl: 'https://dewalist.com/' },
      { domain: 'topclassifieds.com', name: 'TopClassifieds', createUrl: 'https://topclassifieds.com/' },
      { domain: 'chaosads.com', name: 'ChaosAds', createUrl: 'https://www.chaosads.com/' },
      { domain: 'global-free-classified-ads.com', name: 'Global Free Classified Ads', createUrl: 'https://www.global-free-classified-ads.com/' },
      { domain: 'adfreeposting.com', name: 'AdFreePosting', createUrl: 'https://adfreeposting.com/' },
      { domain: 'golocalads.com', name: 'GoLocalAds', createUrl: 'https://www.golocalads.com/' },
      { domain: 'olx.in', name: 'OLX India', createUrl: 'https://www.olx.in/post' },
      { domain: 'quikr.com', name: 'Quikr', createUrl: 'https://www.quikr.com/post-classifieds-ads/' },
      { domain: 'clickindia.com', name: 'ClickIndia', createUrl: 'https://www.clickindia.com/' },
    ],
  },
  {
    group: 'India-Specific',
    domains: [
      { domain: 'justdial.com', name: 'Justdial', createUrl: 'https://www.justdial.com/Free-Listing' },
      { domain: 'sulekha.com', name: 'Sulekha', createUrl: 'https://business.sulekha.com/' },
      { domain: 'indiamart.com', name: 'IndiaMART', createUrl: 'https://seller.indiamart.com/' },
      { domain: 'tradeindia.com', name: 'TradeIndia', createUrl: 'https://www.tradeindia.com/register.html' },
      { domain: 'exportersindia.com', name: 'ExportersIndia', createUrl: 'https://www.exportersindia.com/register-business-online.htm' },
      { domain: 'grotal.com', name: 'Grotal', createUrl: 'https://www.grotal.com/' },
      { domain: 'asklaila.com', name: 'AskLaila', createUrl: 'https://www.asklaila.com/' },
      { domain: 'yellowpages.in', name: 'YellowPages India', createUrl: 'http://www.yellowpages.in/' },
    ],
  },
  {
    group: 'Company Databases',
    domains: [
      { domain: 'crunchbase.com', name: 'Crunchbase', createUrl: 'https://www.crunchbase.com/add-new' },
      { domain: 'glassdoor.com', name: 'Glassdoor', createUrl: 'https://www.glassdoor.com/employers/' },
      { domain: 'indeed.com', name: 'Indeed Company Pages', createUrl: 'https://www.indeed.com/hire' },
      { domain: 'wellfound.com', name: 'Wellfound (AngelList)', createUrl: 'https://wellfound.com/recruit' },
      { domain: 'ambitionbox.com', name: 'AmbitionBox', createUrl: 'https://www.ambitionbox.com/contribute' },
      { domain: 'craft.co', name: 'Craft.co', createUrl: 'https://craft.co/' },
      { domain: 'opencorporates.com', name: 'OpenCorporates', createUrl: 'https://opencorporates.com/' },
      { domain: 'dnb.com', name: 'Dun & Bradstreet (D&B)', createUrl: 'https://www.dnb.com/duns-number.html' },
      { domain: 'bizapedia.com', name: 'Bizapedia', createUrl: 'https://www.bizapedia.com/' },
    ],
  },
  {
    group: 'Startup / Product / AI Directories',
    domains: [
      { domain: 'producthunt.com', name: 'Product Hunt', createUrl: 'https://www.producthunt.com/posts/new' },
      { domain: 'betalist.com', name: 'BetaList', createUrl: 'https://betalist.com/submit' },
      { domain: 'alternativeto.net', name: 'AlternativeTo', createUrl: 'https://alternativeto.net/add-application/' },
      { domain: 'theresanaiforthat.com', name: "There's An AI For That", createUrl: 'https://theresanaiforthat.com/submit/' },
      { domain: 'futurepedia.io', name: 'Futurepedia', createUrl: 'https://www.futurepedia.io/submit-tool' },
      { domain: 'toolify.ai', name: 'Toolify.ai', createUrl: 'https://www.toolify.ai/submit' },
    ],
  },
  {
    group: 'Content Publishing',
    domains: [
      { domain: 'medium.com', name: 'Medium', createUrl: 'https://medium.com/new-story' },
      { domain: 'substack.com', name: 'Substack', createUrl: 'https://substack.com/signup' },
      { domain: 'dev.to', name: 'DEV Community', createUrl: 'https://dev.to/enter' },
      { domain: 'hashnode.com', name: 'Hashnode', createUrl: 'https://hashnode.com/onboard' },
      { domain: 'hackernoon.com', name: 'HackerNoon', createUrl: 'https://app.hackernoon.com/new' },
      { domain: 'tumblr.com', name: 'Tumblr', createUrl: 'https://www.tumblr.com/register' },
      { domain: 'vocal.media', name: 'Vocal Media', createUrl: 'https://vocal.media/' },
      { domain: 'hubpages.com', name: 'HubPages', createUrl: 'https://hubpages.com/user/new/' },
      { domain: 'blogger.com', name: 'Blogger', createUrl: 'https://www.blogger.com/' },
      { domain: 'wordpress.com', name: 'WordPress.com', createUrl: 'https://wordpress.com/start/' },
      { domain: 'slideshare.net', name: 'SlideShare', createUrl: 'https://www.slideshare.net/upload' },
      { domain: 'issuu.com', name: 'Issuu', createUrl: 'https://issuu.com/pricing' },
      { domain: 'fliphtml5.com', name: 'FlipHTML5', createUrl: 'https://fliphtml5.com/login.php?register' },
      { domain: 'justpaste.it', name: 'JustPaste.it', createUrl: 'https://justpaste.it/' },
      { domain: 'pastelink.net', name: 'Pastelink', createUrl: 'https://pastelink.net/' },
      { domain: 'posteezy.com', name: 'Posteezy', createUrl: 'https://posteezy.com/' },
      { domain: 'pearltrees.com', name: 'Pearltrees', createUrl: 'https://www.pearltrees.com/' },
      { domain: 'profile.hatena.ne.jp', name: 'Hatena Profile', createUrl: 'https://www.hatena.ne.jp/register' },
      { domain: 'knowyourmeme.com', name: 'Know Your Meme', createUrl: 'https://knowyourmeme.com/signup' },
      { domain: 'viki.com', name: 'Viki', createUrl: 'https://www.viki.com/' },
      { domain: 'sites.google.com', name: 'Google Sites', createUrl: 'https://sites.google.com/' },
    ],
  },
  {
    group: 'Video & Podcast',
    domains: [
      { domain: 'youtube.com', name: 'YouTube', createUrl: 'https://studio.youtube.com/' },
      { domain: 'vimeo.com', name: 'Vimeo', createUrl: 'https://vimeo.com/join' },
      { domain: 'open.spotify.com', name: 'Spotify', createUrl: 'https://podcasters.spotify.com/' },
      { domain: 'podmatch.com', name: 'PodMatch', createUrl: 'https://podmatch.com/' },
    ],
  },
  {
    group: 'Press Release',
    domains: [
      { domain: 'prlog.org', name: 'PRLog', createUrl: 'https://www.prlog.org/submit-free-press-release.html' },
      { domain: 'openpr.com', name: 'openPR', createUrl: 'https://www.openpr.com/news/submit.html' },
      { domain: 'pr.com', name: 'PR.com', createUrl: 'https://www.pr.com/register' },
    ],
  },
  {
    group: 'Journalist / Earned Media',
    domains: [
      { domain: 'qwoted.com', name: 'Qwoted', createUrl: 'https://www.qwoted.com/' },
      { domain: 'featured.com', name: 'Featured.com', createUrl: 'https://featured.com/' },
      { domain: 'sourcebottle.com', name: 'SourceBottle', createUrl: 'https://www.sourcebottle.com/' },
      { domain: 'mentionmatch.com', name: 'MentionMatch', createUrl: 'https://mentionmatch.com/' },
      { domain: 'sourceofsources.com', name: 'Source of Sources (SOS)', createUrl: 'https://sourceofsources.com/' },
    ],
  },
  {
    group: 'Industry-Specific',
    domains: [
      { domain: 'angi.com', name: 'Angi', createUrl: 'https://www.angi.com/pro' },
      { domain: 'thumbtack.com', name: 'Thumbtack', createUrl: 'https://www.thumbtack.com/pro' },
      { domain: 'houzz.com', name: 'Houzz', createUrl: 'https://www.houzz.com/professionals' },
      { domain: 'avvo.com', name: 'Avvo', createUrl: 'https://www.avvo.com/attorney-profile' },
      { domain: 'healthgrades.com', name: 'Healthgrades', createUrl: 'https://update.healthgrades.com/' },
      { domain: 'zillow.com', name: 'Zillow Premier Agent', createUrl: 'https://premieragent.zillow.com/' },
      { domain: 'homepros411.com', name: 'HomePros411', createUrl: 'https://homepros411.com/' },
      { domain: 'localhomeservicepros.com', name: 'Local Home Service Pros', createUrl: 'https://localhomeservicepros.com/' },
      { domain: 'askhomeservices.com', name: 'Ask Home Services', createUrl: 'https://askhomeservices.com/' },
    ],
  },
  {
    group: 'Wikis & Knowledge Graph',
    domains: [
      { domain: 'wikipedia.org', name: 'Wikipedia', createUrl: 'https://en.wikipedia.org/wiki/Wikipedia:Articles_for_creation' },
      { domain: 'wikidata.org', name: 'Wikidata', createUrl: 'https://www.wikidata.org/wiki/Special:NewItem' },
    ],
  },
];

function formatDefaultName(domain: string): string {
  const cleaned = domain.replace(/^www\./, '').split('/')[0];
  const base = cleaned.split('.')[0];
  return base.charAt(0).toUpperCase() + base.slice(1);
}

export function getSeededSiteRegistry(): SeedRegistrySite[] {
  const seen = new Set<string>();
  const result: SeedRegistrySite[] = [];

  for (const groupEntry of RAW_GROUPS) {
    for (const item of groupEntry.domains) {
      const normalizedDomain = item.domain.trim().toLowerCase();
      if (seen.has(normalizedDomain)) continue;
      seen.add(normalizedDomain);

      result.push({
        name: item.name || formatDefaultName(normalizedDomain),
        searchDomain: normalizedDomain,
        group: groupEntry.group,
        createUrl: item.createUrl || `https://${normalizedDomain}`,
        enabled: true,
      });
    }
  }

  return result;
}
