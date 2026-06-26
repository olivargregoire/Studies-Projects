FROM debian:stable-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
    && apt-get install -y --no-install-recommends vsftpd \
    && rm -rf /var/lib/apt/lists/*

# Créer le répertoire attendu par vsftpd pour secure_chroot_dir
# vsftpd vérifie l'existence de /var/run/vsftpd/empty à l'initialisation
RUN mkdir -p /var/run/vsftpd/empty \
    && chown root:root /var/run/vsftpd/empty \
    && chmod 755 /var/run/vsftpd/empty

# Copier la configuration fournie par le repo
COPY vsftpd.conf /etc/vsftpd.conf

# Créer un utilisateur de test 'ftpuser' avec mot de passe 'ftpuser'
# et définir le dossier partagé par défaut (/srv/ftp)
RUN useradd -m -d /srv/ftp ftpuser \
    && echo "ftpuser:ftpuser" | chpasswd \
    && chown -R ftpuser:ftpuser /srv/ftp

EXPOSE 20 21 30000-30010

# Lancer vsftpd en mode non-daemon
CMD ["/usr/sbin/vsftpd", "/etc/vsftpd.conf"]
