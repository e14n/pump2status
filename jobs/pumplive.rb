current_users = 0
current_sites = 0

SCHEDULER.every '60s' do
  last_users = current_users
  last_sites = current_sites
  current_users = rand(10000)
  current_sites = rand(100)

  send_event('users', { current: current_users, last: last_users })
  send_event('sites', { current: current_sites, last: last_sites })
end
