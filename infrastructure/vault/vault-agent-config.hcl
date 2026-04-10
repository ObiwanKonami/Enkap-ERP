# HashiCorp Vault Agent Sidecar Konfigürasyonu
#
# Vault Agent, pod içinde sidecar olarak çalışır ve:
#  1. Kubernetes Service Account token ile Vault'a kimlik doğrular
#  2. Secrets'ları çeker ve dosya sistemine yazar
#  3. Lease süresi dolmadan otomatik yeniler (dinamik rotasyon)
#
# Pod annotation'larından tetiklenir (vault.hashicorp.com/agent-inject: "true")
# Bu dosya: debug/test için manuel Vault Agent başlatmak amacıyla

vault {
  address = "http://vault.vault.svc.cluster.local:8200"
}

# Kubernetes Service Account kimlik doğrulaması
auto_auth {
  method "kubernetes" {
    mount_path = "auth/kubernetes"
    config = {
      role = "enkap-services"
    }
  }

  # Token yenileme başarısız olursa eski token'ı sil
  sink "file" {
    config = {
      path = "/vault/secrets/.vault-token"
    }
  }
}

# Cache — Vault'a her istek için doğrudan bağlantı yerine yerel önbellek
cache {
  use_auto_auth_token = true
}

# Listener — diğer processler bu socket üzerinden token alabilir
listener "unix" {
  address     = "/vault/agent.sock"
  tls_disable = true
}

# Şablon rendering — Secret → dosya sistemi
template {
  source      = "/vault/config/jwt.tmpl"
  destination = "/vault/secrets/jwt.env"
  # Lease yenilendikçe dosya otomatik güncellenir
  perms       = "0400"
}

template {
  source      = "/vault/config/database.tmpl"
  destination = "/vault/secrets/database.env"
  perms       = "0400"
}
