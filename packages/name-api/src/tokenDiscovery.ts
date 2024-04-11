import { getProvider } from "./resolve";
import { ethers } from "ethers";

const IPFS_PREFIX = 'ipfs://'; 
const IPFS_DESIGNATOR = '/ipfs/';
const IPFS_IO_RESOLVER = 'https://ipfs.io';

interface AvatarEntry {
  url: string;
  timeStamp: number;
}

let avatarCache = new Map<string, AvatarEntry>();
const MAX_AVATAR_CACHE = 3000;
const CACHE_TIMEOUT = 1000 * 60 * 60 * 24;

async function fetchWithIPFS(url: string): Promise<Response> {
  var useUrl: string;
  if (isIPFS(url)) {
    useUrl = resolveIPFS(url);
  } else {
    useUrl = url;
  }

  return fetch(useUrl);
}

function shouldBeIPFS(url: string): boolean {
  return /^Qm[1-9A-Za-z]{44}(\/.*)?$/.test(url);
}

export function isIPFS(url: string): boolean {
  return (url.includes(IPFS_DESIGNATOR) || url.startsWith(IPFS_PREFIX) || shouldBeIPFS(url));
}

function resolveIPFS(URL: string): string {
  if (!URL) return URL;
  let parsed = URL;
  let ipfsIndex = URL.lastIndexOf(IPFS_DESIGNATOR);
  if (ipfsIndex >= 0) {
      parsed = IPFS_IO_RESOLVER + URL.substring(ipfsIndex);
  } else if (URL.startsWith(IPFS_PREFIX)) {
      parsed = IPFS_IO_RESOLVER + IPFS_DESIGNATOR + URL.substring(IPFS_PREFIX.length);
  } else if (shouldBeIPFS(URL)) { //have seen some NFTs designating only the IPFS hash
      parsed = IPFS_IO_RESOLVER + IPFS_DESIGNATOR + URL;
  }
  return parsed;
}

async function getMetadata(chainId: number, tokenContract: string, tokenId: Number): Promise<JSON> {
    const provider = getProvider(chainId);

    const fetchMetaData = new ethers.Contract(tokenContract, [
      'function tokenURI(uint256 tokenId) view returns (string)'
    ], provider);
  
    const result = await fetchMetaData.tokenURI(tokenId);
    //console.log(`METADATA 1: ${result}`);

    var tokenJSON: JSON;

    //is this JSON or another URL?
    if (!result) {
      tokenJSON = JSON.parse('{}');
    }
    else if (isValidUrl(result)) {
      //treat as URL, fetch JSON
      const tokenReq = await fetchWithIPFS(result);
      tokenJSON = await tokenReq.json();
    } else {
      tokenJSON = JSON.parse(result);
    }

    return tokenJSON;
} 

// @ts-ignore
export const tokenAvatarRequest = async (chainId: number, tokenContract: string, tokenId: Number) => {
  try {
    //first try the cache
    let cachedResult: string = getCachedAvatar(getTokenKey(chainId, tokenContract, tokenId));
    if (cachedResult.length > 0) {
      return cachedResult;
    }

    const tokenJSON = await getMetadata(chainId, tokenContract, tokenId);

    //console.log(`JSON Metadata: ${JSON.stringify(tokenJSON)}`);

    // @ts-ignore
    const avatarData: string = ('image' in tokenJSON) ? tokenJSON.image : "";

    if (avatarData.length > 0) {
      //cache this entry
      addToCache(getTokenKey(chainId, tokenContract, tokenId) , avatarData);
    }

    return avatarData;
  } catch (error) {
    console.log("error: ", error);
    return "";
  }
}

function getTokenKey(chainId: number, tokenContract: string, tokenId: Number): string {
  return tokenContract + "-" + chainId + "-" + tokenId;
}

function addToCache(tokenKey: string, avatar: string) {
  const keySet = Array.from(avatarCache.keys());
  // Remove random entry from cache (this avoids needing to sort or maintain a separate stack)
  if (keySet.length > MAX_AVATAR_CACHE) {
    const randomIndex = Math.floor(Math.random() * keySet.length);
    let keyToRemove = keySet[randomIndex];
    avatarCache.delete(keyToRemove);
  }

  avatarCache.set(tokenKey, {url: avatar, timeStamp: Date.now()});
}

function getCachedAvatar(cacheKey: string): string {
  let cachedResult: AvatarEntry | undefined = avatarCache.get(cacheKey);

  var avatarReturn: string = "";

  if (cachedResult !== undefined) {
    if (Date.now() > (cachedResult.timeStamp + CACHE_TIMEOUT)) {
      avatarCache.delete(cacheKey);
    } else {
      avatarReturn = cachedResult.url;
    }
  }

  return avatarReturn;
}

function isValidUrl(testUrl: string): boolean {
  try {
    if (isIPFS(testUrl)) {
      return true;
    }
    new URL(testUrl);
    return true;
  } catch (_) {
    return false;
  }
}
