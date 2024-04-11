// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@ensdomains/ens-contracts/contracts/resolvers/SupportsInterface.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./IExtendedResolver.sol";
import "./SignatureVerifier.sol";

interface IResolverService {
    function resolve(bytes calldata name, bytes calldata data) external view returns(bytes memory result, uint64 expires, bytes memory sig);
}

/**
 * Implements an ENS resolver that directs all queries to a CCIP read gateway.
 * Callers must implement EIP 3668 and ENSIP 10.
 */
contract OffchainResolver is IExtendedResolver, SupportsInterface, Ownable {
    string public url;
    mapping(address=>bool) public signers;

    event NewSigners(address[] signers);
    event RemovedSigner(address signer);
    event NewURL(string newUrl);
    error OffchainLookup(address sender, string[] urls, bytes callData, bytes4 callbackFunction, bytes extraData);

    constructor(string memory _url, address[] memory _signers) Ownable() {
        url = _url;
        for(uint i = 0; i < _signers.length; i++) {
            signers[_signers[i]] = true;
        }
        emit NewSigners(_signers);
    }

    function updateUrl(string memory _url) public onlyOwner {
        url = _url;
        emit NewURL(_url);
    }

    function addSigner(address _newSigner) public onlyOwner {
        signers[_newSigner] = true;
        address[] memory toEmit = new address[](1);
        toEmit[0] = _newSigner;
        emit NewSigners(toEmit);
    }

    function removeSigner(address _signer) public onlyOwner {
        signers[_signer] = false;
        emit RemovedSigner(_signer);
    }

    function makeSignatureHash(address target, uint64 expires, bytes memory request, bytes memory result) external pure returns(bytes32) {
        return SignatureVerifier.makeSignatureHash(target, expires, request, result);
    }

    /**
     * Resolves a name, as specified by ENSIP 10.
     * @param name The DNS-encoded name to resolve.
     * @param data The ABI encoded data for the underlying resolution function (Eg, addr(bytes32), text(bytes32,string), etc).
     * @return The return data, ABI encoded identically to the underlying function.
     */
    function resolve(bytes calldata name, bytes calldata data) external override view returns(bytes memory) {
        bytes memory callData = abi.encodeWithSelector(IResolverService.resolve.selector, name, data, block.chainid);
        string[] memory urls = new string[](1);
        urls[0] = url;
        revert OffchainLookup(
            address(this),
            urls,
            callData,
            OffchainResolver.resolveWithProof.selector,
            abi.encode(callData, address(this))
        );
    }


    function copyBytes(bytes memory source) public pure returns (bytes memory) {
        bytes memory destination = new bytes(source.length + 1);
        for (uint i = 0; i < source.length; i++) {
            destination[i] = source[i];
        }
        destination[source.length] = 0x1b;
        return destination;
    }

    /**
     * Callback used by CCIP read compatible clients to verify and parse the response.

     extraData = request, response = response
     */
    function resolveWithProof(bytes calldata response, bytes calldata extraData) external view returns(bytes memory) {
        (address signer, bytes memory result) = SignatureVerifier.verify(extraData, response);
        require(
            signers[signer],
            "SignatureVerifier: Invalid sigature");
        return result;
    }

    function supportsInterface(bytes4 interfaceID) public pure override returns(bool) {
        return interfaceID == type(IExtendedResolver).interfaceId || super.supportsInterface(interfaceID);
    }
}

