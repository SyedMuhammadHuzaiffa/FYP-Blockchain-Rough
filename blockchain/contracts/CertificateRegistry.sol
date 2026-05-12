// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CertificateRegistry {
    address public owner;

    struct CertificateRecord {
        bytes32 certificateHash;
        string ipfsCid;
        address issuer;
        uint256 issuedAt;
        bool revoked;
        uint256 revokedAt;
    }

    struct BatchRecord {
        bytes32 batchRoot;
        address issuer;
        uint256 issuedAt;
        bool revoked;
        uint256 revokedAt;
    }

    mapping(address => bool) public authorizedIssuers;
    mapping(string => CertificateRecord) private certificates;
    mapping(string => BatchRecord) private batches;

    event IssuerAuthorized(address indexed issuer);
    event IssuerRemoved(address indexed issuer);

    event CertificateIssued(
        string indexed certificateId,
        bytes32 indexed certificateHash,
        string ipfsCid,
        address indexed issuer,
        uint256 issuedAt
    );

    event CertificateRevoked(
        string indexed certificateId,
        address indexed revokedBy,
        uint256 revokedAt
    );

    event BatchAnchored(
        string indexed batchId,
        bytes32 indexed batchRoot,
        address indexed issuer,
        uint256 issuedAt
    );

    event BatchRevoked(
        string indexed batchId,
        address indexed revokedBy,
        uint256 revokedAt
    );

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyAuthorizedIssuer() {
        require(authorizedIssuers[msg.sender], "Not authorized issuer");
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedIssuers[msg.sender] = true;

        emit IssuerAuthorized(msg.sender);
    }

    function authorizeIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid issuer");
        require(!authorizedIssuers[issuer], "Issuer already authorized");

        authorizedIssuers[issuer] = true;

        emit IssuerAuthorized(issuer);
    }

    function removeIssuer(address issuer) external onlyOwner {
        require(issuer != address(0), "Invalid issuer");
        require(authorizedIssuers[issuer], "Issuer not authorized");

        authorizedIssuers[issuer] = false;

        emit IssuerRemoved(issuer);
    }

    function issueCertificate(
        string calldata certificateId,
        bytes32 certificateHash,
        string calldata ipfsCid
    ) external onlyAuthorizedIssuer {
        require(bytes(certificateId).length > 0, "Empty certificateId");
        require(certificateHash != bytes32(0), "Empty certificateHash");
        require(certificates[certificateId].issuedAt == 0, "Already issued");

        certificates[certificateId] = CertificateRecord({
            certificateHash: certificateHash,
            ipfsCid: ipfsCid,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            revoked: false,
            revokedAt: 0
        });

        emit CertificateIssued(
            certificateId,
            certificateHash,
            ipfsCid,
            msg.sender,
            block.timestamp
        );
    }

    function revokeCertificate(
        string calldata certificateId
    ) external onlyAuthorizedIssuer {
        require(bytes(certificateId).length > 0, "Empty certificateId");

        CertificateRecord storage certificate = certificates[certificateId];

        require(certificate.issuedAt != 0, "Certificate not found");
        require(!certificate.revoked, "Already revoked");

        certificate.revoked = true;
        certificate.revokedAt = block.timestamp;

        emit CertificateRevoked(certificateId, msg.sender, block.timestamp);
    }

    function anchorBatch(
        string calldata batchId,
        bytes32 batchRoot
    ) external onlyAuthorizedIssuer {
        require(bytes(batchId).length > 0, "Empty batchId");
        require(batchRoot != bytes32(0), "Empty batchRoot");
        require(batches[batchId].issuedAt == 0, "Batch already anchored");

        batches[batchId] = BatchRecord({
            batchRoot: batchRoot,
            issuer: msg.sender,
            issuedAt: block.timestamp,
            revoked: false,
            revokedAt: 0
        });

        emit BatchAnchored(batchId, batchRoot, msg.sender, block.timestamp);
    }

    function revokeBatch(
        string calldata batchId
    ) external onlyAuthorizedIssuer {
        require(bytes(batchId).length > 0, "Empty batchId");

        BatchRecord storage batch = batches[batchId];

        require(batch.issuedAt != 0, "Batch not found");
        require(!batch.revoked, "Batch already revoked");

        batch.revoked = true;
        batch.revokedAt = block.timestamp;

        emit BatchRevoked(batchId, msg.sender, block.timestamp);
    }

    function verifyCertificate(
        string calldata certificateId
    )
        external
        view
        returns (
            bytes32 certificateHash,
            string memory ipfsCid,
            address issuer,
            uint256 issuedAt,
            bool revoked,
            uint256 revokedAt,
            bool exists
        )
    {
        CertificateRecord memory certificate = certificates[certificateId];
        bool certificateExists = certificate.issuedAt != 0;

        return (
            certificate.certificateHash,
            certificate.ipfsCid,
            certificate.issuer,
            certificate.issuedAt,
            certificate.revoked,
            certificate.revokedAt,
            certificateExists
        );
    }

    function verifyBatch(
        string calldata batchId
    )
        external
        view
        returns (
            bytes32 batchRoot,
            address issuer,
            uint256 issuedAt,
            bool revoked,
            uint256 revokedAt,
            bool exists
        )
    {
        BatchRecord memory batch = batches[batchId];
        bool batchExists = batch.issuedAt != 0;

        return (
            batch.batchRoot,
            batch.issuer,
            batch.issuedAt,
            batch.revoked,
            batch.revokedAt,
            batchExists
        );
    }
}
