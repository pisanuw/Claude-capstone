#include <stdlib.h>
#include <string.h>
#include "ht.h"

static unsigned long hash_string(const char *key) {
    unsigned long hash = 5381;
    for (const char *p = key; *p; p++) {
        hash = hash * 33 + (unsigned char)*p;
    }
    return hash;
}

static void grow(HashTable *table) {
    size_t new_cap = table->capacity * 2;
    Node **buckets = calloc(new_cap, sizeof(Node *));
    for (size_t i = 0; i < table->capacity; i++) {
        Node *node = table->buckets[i];
        while (node != NULL) {
            Node *next = node->next;
            size_t slot = hash_string(node->key) % new_cap;
            node->next = buckets[slot];
            buckets[slot] = node;
            node = next;
        }
    }
    free(table->buckets);
    table->buckets = buckets;
    table->capacity = new_cap;
}

void ht_put(HashTable *table, const char *key, int value) {
    size_t slot = hash_string(key) % table->capacity;
    for (Node *node = table->buckets[slot]; node != NULL; node = node->next) {
        if (strcmp(node->key, key) == 0) {
            node->value = value;
            return;
        }
    }
    Node *node = malloc(sizeof(Node));
    node->key = strdup(key);
    node->value = value;
    node->next = table->buckets[slot];
    table->buckets[slot] = node;
    table->size++;
    if ((double)table->size / table->capacity > 0.75) {
        grow(table);
    }
}

int ht_get(const HashTable *table, const char *key, int *out) {
    size_t slot = hash_string(key) % table->capacity;
    for (Node *node = table->buckets[slot]; node != NULL; node = node->next) {
        if (strcmp(node->key, key) == 0) {
            *out = node->value;
            return 1;
        }
    }
    return 0;
}

void ht_free(HashTable *table) {
    for (size_t i = 0; i < table->capacity; i++) {
        Node *node = table->buckets[i];
        while (node != NULL) {
            Node *next = node->next;
            free(node->key);
            free(node);
            node = next;
        }
    }
    free(table->buckets);
    free(table);
}
