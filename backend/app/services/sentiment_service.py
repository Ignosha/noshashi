import os
import asyncio
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import aiohttp

class SentimentService:
    def __init__(self):
        self.apify_token = os.getenv("APIFY_TOKEN")
        self.reddit_client_id = os.getenv("REDDIT_CLIENT_ID")
        self.reddit_client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    
    async def analyze_ticker(self, ticker: str) -> Dict:
        reddit_mentions = await self._scrape_reddit(ticker)
        twitter_mentions = await self._scrape_twitter(ticker)
        
        all_mentions = reddit_mentions + twitter_mentions
        sentiment_score = self._calculate_sentiment(all_mentions)
        
        return {
            "ticker": ticker,
            "overall_sentiment": self._sentiment_label(sentiment_score),
            "sentiment_score": sentiment_score,
            "mention_count": len(all_mentions),
            "sources": {
                "reddit": len(reddit_mentions),
                "twitter": len(twitter_mentions),
            },
        }
    
    async def analyze_ticker_detailed(self, ticker: str, hours: int = 24) -> Dict:
        cutoff = datetime.utcnow() - timedelta(hours=hours)
        
        reddit_mentions = await self._scrape_reddit(ticker, cutoff)
        twitter_mentions = await self._scrape_twitter(ticker, cutoff)
        
        all_mentions = reddit_mentions + twitter_mentions
        sentiment_score = self._calculate_sentiment(all_mentions)
        
        top_mentions = sorted(all_mentions, key=lambda x: x["engagement"], reverse=True)[:10]
        
        return {
            "ticker": ticker,
            "overall_sentiment": self._sentiment_label(sentiment_score),
            "sentiment_score": sentiment_score,
            "mention_count": len(all_mentions),
            "trending_score": min(len(all_mentions) / 100, 1.0),
            "sources": {
                "reddit": len(reddit_mentions),
                "twitter": len(twitter_mentions),
            },
            "top_mentions": top_mentions,
            "time_range": f"Last {hours}h",
        }
    
    async def get_trending_tickers(self, limit: int = 20) -> List[Dict]:
        from app.services.polygon_service import PolygonService
        pg = PolygonService()
        movers = await pg.get_top_movers(limit)
        
        trending = []
        for mover in movers:
            sentiment = await self.analyze_ticker(mover["ticker"])
            trending.append({
                "ticker": mover["ticker"],
                "mention_count": sentiment["mention_count"],
                "sentiment_score": sentiment["sentiment_score"],
                "sources": list(sentiment["sources"].keys()),
                "trending_score": min(sentiment["mention_count"] / 100, 1.0),
                "last_updated": datetime.utcnow(),
            })
        return trending
    
    async def get_mentions(self, ticker: str, limit: int = 50) -> List[Dict]:
        reddit = await self._scrape_reddit(ticker)
        twitter = await self._scrape_twitter(ticker)
        all_mentions = reddit + twitter
        all_mentions.sort(key=lambda x: x["timestamp"], reverse=True)
        return all_mentions[:limit]
    
    async def _scrape_reddit(self, ticker: str, since: Optional[datetime] = None) -> List[Dict]:
        if not self.reddit_client_id:
            return []
        
        mentions = []
        subreddits = ["stocks", "investing", "SecurityAnalysis", "options", "cryptocurrency"]
        
        async with aiohttp.ClientSession() as session:
            for sub in subreddits:
                try:
                    url = f"https://www.reddit.com/r/{sub}/search.json"
                    params = {"q": ticker, "sort": "new", "limit": 25, "restrict_sr": 1}
                    async with session.get(url, params=params) as resp:
                        if resp.status != 200:
                            continue
                        data = await resp.json()
                        for post in data.get("data", {}).get("children", []):
                            post_data = post.get("data", {})
                            created = datetime.utcfromtimestamp(post_data.get("created_utc", 0))
                            if since and created < since:
                                continue
                            mentions.append({
                                "source": "reddit",
                                "ticker": ticker,
                                "content": post_data.get("title", "") + " " + post_data.get("selftext", "")[:200],
                                "author": post_data.get("author", "unknown"),
                                "timestamp": created,
                                "sentiment": "neutral",
                                "sentiment_score": 0.0,
                                "engagement": post_data.get("score", 0) + post_data.get("num_comments", 0),
                                "url": f"https://reddit.com{post_data.get('permalink', '')}",
                            })
                except Exception:
                    continue
        
        return mentions
    
    async def _scrape_twitter(self, ticker: str, since: Optional[datetime] = None) -> List[Dict]:
        if not self.apify_token:
            return []
        
        mentions = []
        try:
            async with aiohttp.ClientSession() as session:
                url = f"https://api.apify.com/v2/actor-tasks/{os.getenv('APIFY_TWITTER_ACTOR', 'apify/twitter-scraper')}/run-sync-get-dataset-items"
                params = {
                    "token": self.apify_token,
                    "search": f"${ticker}",
                    "maxResults": 25,
                }
                async with session.get(url, params=params) as resp:
                    if resp.status != 200:
                        return []
                    data = await resp.json()
                    for item in data:
                        mentions.append({
                            "source": "twitter",
                            "ticker": ticker,
                            "content": item.get("text", "")[:280],
                            "author": item.get("user", {}).get("username", "unknown"),
                            "timestamp": datetime.fromisoformat(item.get("createdAt", datetime.utcnow().isoformat())),
                            "sentiment": "neutral",
                            "sentiment_score": 0.0,
                            "engagement": item.get("likeCount", 0) + item.get("retweetCount", 0),
                            "url": item.get("url", ""),
                        })
        except Exception:
            pass
        
        return mentions
    
    def _calculate_sentiment(self, mentions: List[Dict]) -> float:
        positive_words = ["bullish", "buy", "pump", "moon", "gem", "undervalued", "growth", "beat", "upgrade", "strong"]
        negative_words = ["bearish", "sell", "dump", "overvalued", "crash", "miss", "downgrade", "weak", "risk", "scam"]
        
        if not mentions:
            return 0.0
        
        score = 0.0
        for mention in mentions:
            text = mention.get("content", "").lower()
            pos = sum(1 for w in positive_words if w in text)
            neg = sum(1 for w in negative_words if w in text)
            total = pos + neg
            if total > 0:
                score += (pos - neg) / total
        
        return max(-1.0, min(1.0, score / len(mentions)))
    
    def _sentiment_label(self, score: float) -> str:
        if score > 0.3:
            return "bullish"
        elif score < -0.3:
            return "bearish"
        return "neutral"
