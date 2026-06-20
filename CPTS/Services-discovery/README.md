This project was part of the Footprinting modules https://academy.hackthebox.com/module/details/112 when they encourage you to try in homelab the various configuration options that can be dangerous. So I deployed a lab for those services (one container = one service) and was able to play with the config of each services: 

    - FTP : vsftpd

    - SMB : Samba

    - NFS : nfs-kernel-server
     
    - DNS : Bind9
     
    - SMTP : Postfix
     
    - IMAP/POP3 : Dovecot
     
    - SNMP : net-snmp
    
    - MySQL : MySQL 8
     
    - MSSQL : SQL Server 2022
     
    - Oracle TNS : Oracle XE (listener TNS)
     
    - IPMI : ipmi-sim (simulation)

All the config files are mounted in volumes


