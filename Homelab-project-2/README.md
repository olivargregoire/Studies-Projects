# DevOps Project – Local, Secure GitOps Platform (Homelab)

## Project Objective
This project sets up a DevOps platform in a local environment, based on Kubernetes and GitOps principles. The goal of my project is to deploy a web application using a CI/CD pipeline, with some traceability of the supply chain and observability.

I used AI to generate this challenge and try to use as less as I could to solve the issues I could face to understand everything. 

The platform is designed to mimic an enterprise‑style DevOps setup, but runs entirely on a local homelab. This project allows myself to familiarize a bit more with : 
- Infrastructure as Code (IaC)
- GitOps workflows (Argo CD / Flux)
- CI/CD pipelines (GitLab CI / GitHub Actions / Jenkins)
- Containerization (Docker)
- Kubernetes cluster management
- Security and secrets management
- Supply chain security (SBOM, image signing, policy checks)
- Observability (logging, metrics, tracing)

## Project goal: 
In this project I want to have : 
- Set up a local Kubernetes cluster that mimics a production environment
- Implement CI/CD pipelines to build, test, scan, and deploy applications
- Ensure supply chain integrity from code to runtime
- Provide real-time observability of applications and cluster metrics
- Enforce security best practices for images, secrets, and deployments
- The end goal is to minimize manual operations, increase deployment reliability, and demonstrate GitOps principles in a local environment.

| Step                                  | Deliverable                                                                | Success Criteria                                                                                                                                                                      |
| ------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Infrastructure Setup (IaC)**     | Kubernetes cluster on `k3d` with namespaces and local registry (JFrog OSS) | - Cluster deploys reproducibly via Terraform & k3d scripts<br>- All namespaces (`apps`, `argocd`, `monitoring`, `security`) exist<br>- Local JFrog registry is running and accessible |
| **2. Application Dockerization**      | Web app Docker image built                                                 | - Image builds successfully with `docker build`<br>- Health endpoint `/health` responds correctly<br>- Image stored in local JFrog registry                                           |
| **3. CI Pipeline (GitHub Actions)**   | Pipeline to lint, test, build, scan, generate SBOM, sign, and push image   | - Pipeline runs on each push<br>- Trivy scan completes without critical vulnerabilities<br>- SBOM generated for every image<br>- Image signed via Cosign and pushed to JFrog          |
| **4. GitOps Deployment (ArgoCD)**     | Automatic deployment of app from Git                                       | - ArgoCD detects changes in Git<br>- App deployed to correct namespace<br>- Drift detection works<br>- No manual `kubectl apply` needed                                               |
| **5. Security Enforcement**           | Kyverno policies, RBAC, SealedSecrets                                      | - Images without SBOM or signature are blocked<br>- Secrets encrypted via SealedSecrets<br>- RBAC prevents unauthorized access<br>- NetworkPolicies isolate app namespaces            |
| **6. Observability**                  | Prometheus + Grafana dashboards                                            | - Metrics visible for both cluster and application<br>- Dashboards show CPU, memory, and pod status<br>- Optional: basic alert triggers configured                                    |
| **7. Documentation & Git Repository** | README, architecture diagrams, pipeline docs                               | - All steps clearly documented<br>- Architecture diagrams included<br>- CI/CD and GitOps process explained<br>- Repository is structured according to best practices                  |


what needs to be install:
- terraform 
- k3d 
- kubectl
- docker
