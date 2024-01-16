import { TokenboundClient } from "@tokenbound/sdk";
import { polygon, polygonMumbai, goerli } from "viem/chains";

export function getTokenBoundAccount(chainId: number, tokenContract: `0x${string}`, tokenId: `0x${string}`) {

	// TODO: Add custom RPC URLS
	let chain = undefined;

	switch (chainId) {
		case 80001:
			chain = polygonMumbai;
			break;
		case 137:
			chain = polygon;
			break;
		case 5:
			chain = goerli;
			break;
	}

	const tbaClient = new TokenboundClient({
		chainId,
		chain
	});

	return tbaClient.getAccount({ tokenContract, tokenId });
}

// Can only be used if user has set up a TBA account 
export function getTokenBoundNFT(chainIdentifier: number, accountAddress: `0x${string}`) {

	let chain = undefined;

	switch (chainIdentifier) {
		case 80001:
			chain = polygonMumbai;
			break;
		case 137:
			chain = polygon;
			break;
		case 5:
			chain = goerli;
			break;

	}

	const tbaClient = new TokenboundClient({
		chainId: chainIdentifier,
		chain
	});

	return tbaClient.getNFT({ accountAddress });
}