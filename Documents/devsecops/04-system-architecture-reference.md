# FEMS System Architecture Reference

## Purpose

The main FEMS system architecture diagram is maintained in the project `README.md`.
This document references that architecture and explains how it is used from a DevSecOps and security perspective.

## Architecture Summary

The FEMS system consists of the following main components:

* React SPA frontend
* API Gateway / Reverse Proxy
* Backend microservices

  * Auth Service
  * Authorizer Service
  * Event Service
  * Ticket Service
  * Venue Service
  * Staff Service
  * Notification Service
  * Wallet Saga Coordinator
* Database layer
* External integrations

  * MoMo
  * VNPay
  * SePay
  * Amazon SES / Email Service

## DevSecOps Relevance

The system architecture is used as an input for DevSecOps planning because it helps identify security-sensitive components and data flows.

| Component                   | Security concern                                           | DevSecOps relevance                         |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------- |
| React SPA Frontend          | Client-side tampering, exposed frontend variables, XSS     | Frontend linting, dependency audit, SAST    |
| API Gateway / Reverse Proxy | Routing bypass, missing access control, weak rate limiting | Configuration review, DAST                  |
| Auth Service                | Token leakage, weak authentication, session abuse          | SAST, secret scanning, authentication tests |
| Authorizer Service          | RBAC bypass, privilege escalation                          | Authorization tests, code review            |
| Ticket Service              | QR replay, duplicate check-in, ticket forgery              | Business security tests                     |
| Wallet Saga Coordinator     | Double refund, inconsistent wallet balance                 | Payment and wallet security tests           |
| Payment integrations        | Webhook forgery, replay attacks, price manipulation        | Webhook signature verification tests        |
| Database layer              | Unauthorized data access, weak constraints, data leakage   | Schema review, migration review             |
| Notification Service        | Email abuse, leaked SMTP credentials                       | Secret scanning, audit logging              |