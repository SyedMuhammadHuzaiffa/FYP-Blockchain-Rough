// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CertificateRegistry {
    error OnlyOwner();
    error NotAuthorizedIssuer();
    error InvalidIssuer();
    error IssuerAlreadyAuthorized();
    error IssuerNotAuthorized();
    error EmptyCertificateId();
    error EmptyCertificateHash();
    error CertificateAlreadyIssued();
    error CertificateNotFound();
    error CertificateAlreadyRevoked();
    error EmptyBatchId();
    error EmptyBatchRoot();
    error BatchAlreadyAnchored();
    error BatchNotFound();
    error BatchAlreadyRevoked();

    address public immutable owner;

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
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyAuthorizedIssuer() {
        if (!authorizedIssuers[msg.sender]) revert NotAuthorizedIssuer();
        _;
    }

    constructor() {
        owner = msg.sender;
        authorizedIssuers[msg.sender] = true;

        emit IssuerAuthorized(msg.sender);
    }

    function authorizeIssuer(address issuer) external onlyOwner {
        if (issuer == address(0)) revert InvalidIssuer();
        if (authorizedIssuers[issuer]) revert IssuerAlreadyAuthorized();

        authorizedIssuers[issuer] = true;

        emit IssuerAuthorized(issuer);
    }

    function removeIssuer(address issuer) external onlyOwner {
        if (issuer == address(0)) revert InvalidIssuer();
        if (!authorizedIssuers[issuer]) revert IssuerNotAuthorized();

        authorizedIssuers[issuer] = false;

        emit IssuerRemoved(issuer);
    }

    function issueCertificate(
        string calldata certificateId,
        bytes32 certificateHash,
        string calldata ipfsCid
    ) external onlyAuthorizedIssuer {
        if (bytes(certificateId).length == 0) revert EmptyCertificateId();
        if (certificateHash == bytes32(0)) revert EmptyCertificateHash();
        CertificateRecord storage certificate = certificates[certificateId];
        // certificateId is the unique on-chain key; block duplicate anchors.
        if (certificate.issuedAt != 0) {
            revert CertificateAlreadyIssued();
        }

        uint256 issuedAt = block.timestamp;

        certificate.certificateHash = certificateHash;
        certificate.ipfsCid = ipfsCid;
        certificate.issuer = msg.sender;
        certificate.issuedAt = issuedAt;

        emit CertificateIssued(
            certificateId,
            certificateHash,
            ipfsCid,
            msg.sender,
            issuedAt
        );
    }

    function revokeCertificate(
        string calldata certificateId
    ) external onlyAuthorizedIssuer {
        if (bytes(certificateId).length == 0) revert EmptyCertificateId();

        CertificateRecord storage certificate = certificates[certificateId];

        // Never create or mutate a missing record during revocation.
        if (certificate.issuedAt == 0) revert CertificateNotFound();
        // Revocation is irreversible, so a second revoke must not rewrite state.
        if (certificate.revoked) revert CertificateAlreadyRevoked();

        uint256 revokedAt = block.timestamp;

        certificate.revoked = true;
        certificate.revokedAt = revokedAt;

        emit CertificateRevoked(certificateId, msg.sender, revokedAt);
    }

    function anchorBatch(
        string calldata batchId,
        bytes32 batchRoot
    ) external onlyAuthorizedIssuer {
        if (bytes(batchId).length == 0) revert EmptyBatchId();
        if (batchRoot == bytes32(0)) revert EmptyBatchRoot();
        BatchRecord storage batch = batches[batchId];
        // batchId is the unique Merkle batch anchor key; block replacement.
        if (batch.issuedAt != 0) revert BatchAlreadyAnchored();

        uint256 issuedAt = block.timestamp;

        batch.batchRoot = batchRoot;
        batch.issuer = msg.sender;
        batch.issuedAt = issuedAt;

        emit BatchAnchored(batchId, batchRoot, msg.sender, issuedAt);
    }

    function revokeBatch(
        string calldata batchId
    ) external onlyAuthorizedIssuer {
        if (bytes(batchId).length == 0) revert EmptyBatchId();

        BatchRecord storage batch = batches[batchId];

        // Never create or mutate a missing batch during revocation.
        if (batch.issuedAt == 0) revert BatchNotFound();
        // Revocation is irreversible, so a second revoke must not rewrite state.
        if (batch.revoked) revert BatchAlreadyRevoked();

        uint256 revokedAt = block.timestamp;

        batch.revoked = true;
        batch.revokedAt = revokedAt;

        emit BatchRevoked(batchId, msg.sender, revokedAt);
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
