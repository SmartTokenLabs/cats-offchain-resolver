// @ts-nocheck
import { tokenAvatarRequest } from "./tokenDiscovery";
import fetch, {
  Headers,
  Request,
  Response,
} from 'node-fetch';

if (!globalThis.fetch) {
  globalThis.fetch = fetch
  globalThis.Headers = Headers
  globalThis.Request = Request
  globalThis.Response = Response
}

import {
  cacheTimeout,
  checkCacheEntries,
  createServer,
  ResolverStatus,
  sendResolverRequest,
  waitForCheck
} from "./server";

async function testResolve() {
  //now check that resolver contract is correct
  let nameCheck = "xnft.eth";
  let nameHash = await sendResolverRequest(nameCheck, 11155111); //test on sepolia

  let result = await waitForCheck(nameHash, 11155111);

  if (result == ResolverStatus.BASE_DOMAIN_NOT_POINTING_HERE) {
    console.log(`Resolver not correctly set for gateway.`);
  } else if (result == ResolverStatus.INTERMEDIATE_DOMAIN_NOT_SET) {
    console.log(`Intermediate name resolver ${nameCheck} not set correctly.`);
  }

  return result;
}

async function testMetaData() {
  const tokenMetaDataImage = await tokenAvatarRequest(1, '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', 1);
  console.log(`Image: ${tokenMetaDataImage}`);

  // Test caching
  const tokenMetaDataImage2 = await tokenAvatarRequest(1, '0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d', 1);
  console.log(`Image: ${tokenMetaDataImage2}`);

  const tokenMetaDataImage3 = await tokenAvatarRequest(11155111, "0x1d22ABF94d59eD1BCD2d62C70A2F17caA445f4Bb", 73301158607185938929634570134102981044984305286916549900884904065023896190976n);
  console.log(`Image: ${tokenMetaDataImage3}`);

  // Test caching
  const tokenMetaDataImage4 = await tokenAvatarRequest(11155111, "0x1d22ABF94d59eD1BCD2d62C70A2F17caA445f4Bb", 73301158607185938929634570134102981044984305286916549900884904065023896190976n);
  console.log(`Image: ${tokenMetaDataImage4}`);
}

const start = async () => {

  try {
    const app = await createServer();

    const host = '0.0.0.0';
    const port = 8083;

    await app.listen({ port, host });
    console.log(`Server is listening on ${host} ${port}`);

    setInterval(checkCacheEntries, cacheTimeout * 2);
    testResolve();
    testMetaData();
  } catch (err) {
    console.log(err);
    process.exit(1);
  }
};

start();