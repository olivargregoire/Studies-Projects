resource "helm_release" "artifactory" {
  name       = "artifactory"
  repository = "https://charts.jfrog.io"
  chart      = "artifactory-oss"
  namespace  = "jfrog"

  values = [
    file("${path.module}/jfrog/values.yaml")
  ]
}