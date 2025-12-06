// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Certificate {
    address public owner;

    struct CertificateData {
        string studentName;
        string course;
        string ipfsHash; // IPFS CID
        uint256 issuedAt;
    }

    mapping(string => CertificateData) private certificates;

    event CertificateAdded(string ipfsHash, string studentName, string course);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can add certificates");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function addCertificate(
        string calldata studentName,
        string calldata course,
        string calldata ipfsHash
    ) external onlyOwner {
        require(bytes(ipfsHash).length > 0, "Empty IPFS hash");
        require(bytes(certificates[ipfsHash].ipfsHash).length == 0, "Already exists");

        certificates[ipfsHash] = CertificateData({
            studentName: studentName,
            course: course,
            ipfsHash: ipfsHash,
            issuedAt: block.timestamp
        });

        emit CertificateAdded(ipfsHash, studentName, course);
    }

    function verifyCertificate(string calldata ipfsHash)
        external
        view
        returns (string memory studentName, string memory course, string memory storedHash, uint256 issuedAt, bool exists)
    {
        CertificateData memory c = certificates[ipfsHash];
        bool found = bytes(c.ipfsHash).length > 0;
        return (c.studentName, c.course, c.ipfsHash, c.issuedAt, found);
    }
}
