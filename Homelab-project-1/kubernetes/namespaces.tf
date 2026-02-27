resource "kubernetes_namespace" "argocd" {
  metadata {
    name = "argocd"
  }
}

resource "kubernetes_namespace" "apps" {
  metadata {
    name = "apps"
  }
}

resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring"
  }
}

resource "kubernetes_namespace" "security" {
  metadata {
    name = "security"
  }
}

resource "kubernetes_namespace" "jfrog" {
  metadata {
    name = "jfrog"
  }
}