import { TokenboundClient } from "@tokenbound/sdk";
import { polygon, polygonMumbai } from "viem/chains";

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
	}

	const tbaClient = new TokenboundClient({
		chainId,
		chain
	});

	return tbaClient.getAccount({ tokenContract, tokenId });
}


interface Accountaddr {
	accountAddress: `0x${string}`;
}

export function getTokenBoundNFT(chainId: number, accountAddress: Accountaddr) {

	let chain = undefined;

	switch (chainId) {
		case 80001:
			chain = polygonMumbai;
			break;
		case 137:
			chain = polygon;
			break;
	}

	const tbaClient = new TokenboundClient({
		chainId,
		chain
	});

	return tbaClient.getNFT(accountAddress);
}