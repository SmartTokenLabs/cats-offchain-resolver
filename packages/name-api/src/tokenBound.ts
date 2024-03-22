import { ethers } from 'ethers';

const REGISTRY_6551 = '0x000000006551c19487814612e58FE06813775758';
const IMPLEMENTATION_USE = '0x55266d75D1a14E4572138116aF39863Ed6596E7F';

function addressToUint8Array(address: string): Uint8Array {
	// Remove '0x' prefix
	const cleanAddress = address.slice(2);

	// Convert hex string to Uint8Array
	const array = new Uint8Array(cleanAddress.length / 2);

	for (let i = 0; i < cleanAddress.length; i += 2) {
		array[i / 2] = parseInt(cleanAddress.slice(i, i + 2), 16)
	}

	return array;
}

function computeTokenBound(chainId: number, tokenContract: string, tokenId: number, salt: number) {

	const constructorArgs = ethers.AbiCoder.defaultAbiCoder().encode(
		["uint256", "uint256", "address", "uint256"],
		[salt, chainId, tokenContract, tokenId]
	);

	const encodedABI = constructorArgs.slice(2);
	const hexImplementation = IMPLEMENTATION_USE.slice(2);

	const hexCreationCode = `0x3d60ad80600a3d3981f3363d3d373d3d3d363d73${hexImplementation}5af43d82803e903d91602b57fd5bf3${encodedABI}`;

	const creationCode = addressToUint8Array(hexCreationCode);
	const bytecodeHash = ethers.keccak256(creationCode);

	const create2Address = ethers.getCreate2Address(
		REGISTRY_6551,
		ethers.zeroPadValue(ethers.toBeHex(salt), 32),
		bytecodeHash
	);

	return create2Address;
}

function hexToNumber(hexString: string): number {
	return parseInt(hexString, 16);
}

export function getTokenBoundAccount(chainId: number, tokenContract: `0x${string}`, tokenId: `0x${string}`) {

	return computeTokenBound(chainId, tokenContract, hexToNumber(tokenId), 0);
}