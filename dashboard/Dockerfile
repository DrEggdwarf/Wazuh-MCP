# Wazuh Dashboard custom (soc-stack) — l'image 4.14.5 ne fournit PAS
# opensearch_dashboards.yml (contrairement à 4.7.2) : on le bake.
FROM wazuh/wazuh-dashboard:4.14.5
COPY --chown=wazuh-dashboard:wazuh-dashboard --chmod=644 \
     opensearch_dashboards.yml /usr/share/wazuh-dashboard/config/opensearch_dashboards.yml
