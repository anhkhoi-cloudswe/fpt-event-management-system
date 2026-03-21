# =============================================================================
# Database Initialization
# =============================================================================

resource "null_resource" "db_init" {
  depends_on = [module.rds]

  provisioner "local-exec" {
    command = <<-EOT
      echo "Waiting for RDS to be available..."
      sleep 90
      mysql -h ${module.rds.db_instance_endpoint} -u admin -p'FptEvent2024!' fpteventmanagement < /home/sen/projects/FPT_EVENT_MANAGEMENT_Microservices/Database/initdb.d/01_fpt_event_full.sql
      echo "Database initialization completed"
    EOT
  }

  triggers = {
    rds_endpoint = module.rds.db_instance_endpoint
  }
}
